import type { ChatMessage, ChatPrompt } from "./ollama";
import { segmentReply } from "./promptExtraction";

/**
 * Tool calls happen before the model's closing sentence. Attach every staged
 * prompt to that closing assistant response so its interaction stays in the
 * same chat bubble and survives conversation persistence.
 */
export function attachPromptsToAssistantMessage(
  messages: ChatMessage[],
  prompts: ChatPrompt[]
): ChatMessage[] {
  if (prompts.length === 0) return messages;

  const target = messages.findLastIndex(
    (message) => message.role === "assistant" && Boolean(message.content.trim())
  );

  if (target === -1) {
    return [
      ...messages,
      {
        role: "assistant",
        content: createdPromptsLabel(prompts.length),
        prompts,
      },
    ];
  }

  return messages.map((message, index) =>
    index === target ? { ...message, prompts } : message
  );
}

export function createdPromptsLabel(count: number): string {
  return `I created ${count} reusable prompt${count === 1 ? "" : "s"}:`;
}

/**
 * Structured prompts are authoritative. If the model also wrote prompt blocks
 * or a menu in prose, retain only its conversational explanation so the prompt
 * information is never drawn twice.
 */
export function assistantTextForStructuredPrompts(
  content: string,
  prompts: ChatPrompt[]
): string {
  if (prompts.length === 0) return content;

  const segments = segmentReply(content);
  if (segments.some((segment) => segment.kind !== "text")) {
    const explanation = segments
      .filter((segment) => segment.kind === "text")
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n\n");
    return explanation || createdPromptsLabel(prompts.length);
  }

  // Some models output a plain list that is too short for prompt extraction.
  // Two matching structured titles are strong evidence that it is a duplicate.
  const lower = content.toLowerCase();
  const positions = prompts
    .map((prompt) => lower.indexOf(prompt.title.toLowerCase()))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b);
  const threshold = Math.min(2, prompts.length);

  if (positions.length >= threshold) {
    const lineStart = content.lastIndexOf("\n", positions[0] - 1) + 1;
    const explanation = content.slice(0, lineStart).trim();
    return explanation || createdPromptsLabel(prompts.length);
  }

  return content.trim() || createdPromptsLabel(prompts.length);
}
