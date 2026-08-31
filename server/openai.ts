/**
 * Model-backed prompt generation.
 *
 * Runs server-side only — in the deployed worker, and behind a dev middleware
 * locally — so the API key never reaches the browser bundle. Uses fetch and
 * nothing else, because the same module has to run under workerd and Node.
 *
 * The deterministic generators in src/lib stay the default: they are instant
 * and work with no key. This is the upgrade path when a key is configured.
 */

export const DEFAULT_MODEL = "gpt-5.2";
export const DEFAULT_EFFORT = "low";

export type GenerateMode = "pack" | "predict";

export type GenerateRequest = {
  mode: GenerateMode;
  idea: string;
  audience?: string;
  platform?: string;
  sourceData?: string;
  constraints?: string;
  /** Agent voice the prompts should be written for. */
  agentRole: string;
  agentInstructions: string;
  /** How many prompts to return. */
  count: number;
  /** Library categories the model may assign. */
  categories: string[];
  /** Titles already shown, so "generate more" does not repeat itself. */
  exclude?: string[];
};

export type GeneratedItem = {
  title: string;
  intent: string;
  category: string;
  content: string;
};

const HOUSE_STYLE = `Every prompt you write must be reusable and self-contained, and must follow this structure exactly:

Act as <role>.

Objective
<one sentence stating what the prompt achieves>

Context I am giving you
- <label>: {{placeholder}}
(one line per input the user supplies; use {{double brace}} placeholders so the prompt can be reused)

Before you begin
Ask up to 3 concise questions only if a missing detail would materially change the answer. Otherwise state assumptions and continue. Never invent facts, figures or research.

Process
- <3 to 5 concrete steps>

Return exactly
- <4 to 6 named output sections>

Rules:
- Write prompts to be run later against any capable AI, not answers to the topic itself.
- Be specific to the stated topic. No filler, no generic marketing language.
- Placeholders must be lowercase words inside {{ }}, e.g. {{target audience}}.`;

function buildInput(request: GenerateRequest) {
  const context = [
    `Topic: ${request.idea}`,
    `Audience: ${request.audience || "not stated"}`,
    `Where the prompts will be used: ${request.platform || "not stated"}`,
    `Inputs the user can supply: ${request.sourceData || "not stated"}`,
    `Constraints: ${request.constraints || "not stated"}`,
  ].join("\n");

  const task =
    request.mode === "pack"
      ? `Write ${request.count} connected prompts that together cover this topic end to end, in the order someone would actually use them. Each must do a distinct job — no overlap.`
      : `Predict the ${request.count} prompts this person is most likely to want NEXT, after the obvious first set. Go for the follow-up questions they have not thought to ask yet — different angles, not variations of one idea.`;

  const avoid = request.exclude?.length
    ? `\n\nAlready shown, do not repeat these or produce near-duplicates:\n${request.exclude
        .map((title) => `- ${title}`)
        .join("\n")}`
    : "";

  return [
    {
      role: "developer" as const,
      content: `You design reusable prompts for a prompt library. You are writing in the voice of this agent profile:

Role: ${request.agentRole}
Working style: ${request.agentInstructions}

${HOUSE_STYLE}

Assign each prompt exactly one category from this list: ${request.categories.join(", ")}.
The "intent" field is one short line explaining why someone would reach for this prompt. Return JSON only.`,
    },
    {
      role: "user" as const,
      content: `${task}\n\n${context}${avoid}`,
    },
  ];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompts"],
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "intent", "category", "content"],
        properties: {
          title: { type: "string" },
          intent: { type: "string" },
          category: { type: "string" },
          content: { type: "string" },
        },
      },
    },
  },
} as const;

/** Pulls the structured JSON out of a Responses API reply. */
function readOutput(payload: unknown): GeneratedItem[] {
  const output = (payload as { output?: unknown[] })?.output;
  if (!Array.isArray(output)) throw new Error("The model returned no output.");

  for (const item of output) {
    const entry = item as { type?: string; content?: unknown[] };
    if (entry.type !== "message" || !Array.isArray(entry.content)) continue;
    for (const part of entry.content) {
      const chunk = part as { type?: string; text?: string };
      if (chunk.type !== "output_text" || typeof chunk.text !== "string") continue;
      const parsed = JSON.parse(chunk.text) as { prompts?: unknown };
      if (!Array.isArray(parsed.prompts)) break;
      return parsed.prompts.filter(
        (prompt): prompt is GeneratedItem =>
          typeof (prompt as GeneratedItem)?.title === "string" &&
          typeof (prompt as GeneratedItem)?.content === "string"
      );
    }
  }

  throw new Error("The model returned no usable prompts.");
}

export type ModelConfig = {
  apiKey: string;
  model?: string;
  effort?: string;
};

export async function generateWithModel(
  request: GenerateRequest,
  config: ModelConfig,
  signal?: AbortSignal
): Promise<{ prompts: GeneratedItem[]; model: string }> {
  const model = config.model || DEFAULT_MODEL;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: buildInput(request),
      text: {
        format: {
          type: "json_schema",
          name: "prompt_pack",
          strict: true,
          schema: SCHEMA,
        },
      },
      reasoning: { effort: config.effort || DEFAULT_EFFORT },
      // Roughly 900 output tokens per prompt, plus headroom.
      max_output_tokens: Math.min(16000, 1200 + request.count * 900),
    }),
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    model?: string;
    status?: string;
    incomplete_details?: { reason?: string };
  };

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message || `The model request failed (${response.status}).`
    );
  }
  if (payload.status === "incomplete") {
    throw new Error(
      `The model stopped early (${payload.incomplete_details?.reason ?? "unknown reason"}). Try asking for fewer prompts.`
    );
  }

  return { prompts: readOutput(payload), model: payload.model || model };
}

/** Validates and normalises a request body arriving from the browser. */
export function parseGenerateRequest(body: unknown): GenerateRequest | string {
  const input = body as Partial<GenerateRequest> | null;
  if (!input || typeof input !== "object") return "Expected a JSON body.";

  const idea = typeof input.idea === "string" ? input.idea.trim() : "";
  if (!idea) return "`idea` is required.";
  if (idea.length > 2000) return "`idea` is too long.";

  const mode = input.mode === "predict" ? "predict" : "pack";
  const count = Math.max(1, Math.min(12, Math.round(Number(input.count) || 4)));

  const categories = Array.isArray(input.categories)
    ? input.categories.filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    : [];

  const text = (value: unknown) =>
    typeof value === "string" ? value.slice(0, 2000) : "";

  return {
    mode,
    idea,
    count,
    audience: text(input.audience),
    platform: text(input.platform),
    sourceData: text(input.sourceData),
    constraints: text(input.constraints),
    agentRole: text(input.agentRole) || "an experienced generalist",
    agentInstructions:
      text(input.agentInstructions) || "Be specific, concrete and practical.",
    categories: categories.length > 0 ? categories.slice(0, 40) : ["General"],
    exclude: Array.isArray(input.exclude)
      ? input.exclude
          .filter((value): value is string => typeof value === "string")
          .slice(0, 40)
      : [],
  };
}
