/**
 * The hosted agent.
 *
 * Same conversation loop as the local Ollama agent, and the same tools — the
 * difference is only where the model runs. Prompt Lab's tools act on the user's
 * own library in this browser, so the loop has to stay client-side: the server
 * route is a stateless pass-through that holds the API key and nothing else.
 *
 * This is the agent the deployed site uses. Ollama stays available for local
 * testing, where a deployed HTTPS page cannot reach http://localhost anyway.
 */

import { PROMPT_TOOLS, executeTool } from "./webmcp";
import { systemPrompt, type ChatMessage, type ChatProgress } from "./ollama";

const APP_BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const MAX_TOOL_ROUNDS = 6;

/** Maps the WebMCP descriptors into the Responses API function-tool shape. */
function toResponsesTools() {
  return PROMPT_TOOLS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    // Prompt Lab's schemas have optional properties, which strict mode forbids.
    strict: false,
    parameters: tool.inputSchema,
  }));
}

type FunctionCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

type OutputItem =
  | FunctionCall
  | {
      type: "message";
      content?: { type?: string; text?: string }[];
    }
  | { type: string };

/**
 * Converts prior turns into Responses input items.
 *
 * Tool messages from earlier turns are dropped: their results are already
 * reflected in the assistant reply that followed, and replaying them would
 * need call ids this history does not carry.
 */
function toInputItems(history: ChatMessage[]) {
  const items: unknown[] = [];

  for (const message of history) {
    if (message.role === "tool" || message.role === "system") continue;

    const images = message.images ?? [];
    if (message.role === "user" && images.length > 0) {
      items.push({
        role: "user",
        content: [
          { type: "input_text", text: message.content },
          ...images.map((base64) => ({
            type: "input_image",
            image_url: `data:image/png;base64,${base64}`,
          })),
        ],
      });
      continue;
    }

    if (!message.content) continue;
    items.push({ role: message.role, content: message.content });
  }

  return items;
}

async function callModel(
  instructions: string,
  input: unknown[],
  signal?: AbortSignal
): Promise<OutputItem[]> {
  const response = await fetch(`${APP_BASE}api/model/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ instructions, input, tools: toResponsesTools() }),
  });

  const payload = (await response.json()) as {
    output?: OutputItem[];
    error?: string;
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `The agent request failed (${response.status}).`);
  }

  return payload.output ?? [];
}

/**
 * Runs one turn, resolving tool calls locally and feeding the results back
 * until the model produces a final answer.
 */
export async function chat(
  history: ChatMessage[],
  progress: ChatProgress = {},
  signal?: AbortSignal
): Promise<ChatMessage[]> {
  const instructions = systemPrompt(progress.agent);
  const input = toInputItems(history);
  const added: ChatMessage[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const output = await callModel(instructions, input, signal);

    const calls: FunctionCall[] = [];
    let text = "";

    for (const item of output) {
      if (item.type === "function_call") {
        calls.push(item as FunctionCall);
        // Echoed back verbatim so the model can match its own call ids.
        input.push(item);
        continue;
      }
      if (item.type === "message") {
        const parts = (item as { content?: { type?: string; text?: string }[] }).content;
        for (const part of parts ?? []) {
          if (part.type === "output_text" && part.text) text += part.text;
        }
      }
    }

    const assistant: ChatMessage = {
      role: "assistant",
      content: text,
      tool_calls: calls.map((call) => ({
        function: {
          name: call.name,
          arguments: safeParse(call.arguments),
        },
      })),
    };

    if (text) input.push({ role: "assistant", content: text });
    if (text || calls.length > 0) {
      added.push(assistant);
      progress.onAssistant?.(assistant);
    }

    if (calls.length === 0) return added;

    for (const call of calls) {
      const args = safeParse(call.arguments);
      const result = await executeTool(call.name, args, "local");
      const rendered = result.content
        .map((part) =>
          part.type === "text" ? part.text : `[Image attachment: ${part.mimeType}]`
        )
        .join("\n");

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: rendered.slice(0, 20_000),
      });

      const toolMessage: ChatMessage = {
        role: "tool",
        content: rendered,
        tool_name: call.name,
      };
      added.push(toolMessage);
      progress.onToolCall?.(call.name, args, rendered);
    }
  }

  const bail: ChatMessage = {
    role: "assistant",
    content: "Stopped after too many tool calls in one turn.",
  };
  added.push(bail);
  return added;
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
