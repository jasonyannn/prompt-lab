import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatPrompt } from "./ollama";
import {
  assistantTextForStructuredPrompts,
  attachPromptsToAssistantMessage,
} from "./chatPrompts";

const prompts: ChatPrompt[] = [
  {
    id: "one",
    title: "Product Page Conversion Audit",
    prompt: "Analyse this product page and identify conversion friction.",
    category: "E-commerce",
    selected: true,
  },
  {
    id: "two",
    title: "Cart Abandonment Optimiser",
    prompt: "Find friction across the cart and checkout experience.",
    category: "E-commerce",
    selected: true,
  },
];

describe("structured chat prompts", () => {
  it("attaches proposals to the closing assistant message", () => {
    const messages: ChatMessage[] = [
      { role: "assistant", content: "", tool_calls: [] },
      { role: "tool", content: "Proposed one", tool_name: "create_prompt" },
      { role: "assistant", content: "I created two reusable prompts:" },
    ];

    const result = attachPromptsToAssistantMessage(messages, prompts);

    expect(result).toHaveLength(3);
    expect(result[2].prompts).toEqual(prompts);
    expect(result[0].prompts).toBeUndefined();
  });

  it("creates an assistant container when the tool loop has no closing text", () => {
    const result = attachPromptsToAssistantMessage(
      [{ role: "tool", content: "Proposed one", tool_name: "create_prompt" }],
      prompts
    );

    expect(result.at(-1)).toMatchObject({
      role: "assistant",
      content: "I created 2 reusable prompts:",
      prompts,
    });
  });

  it("removes a duplicate written prompt list while keeping the explanation", () => {
    const content = `I created two reusable prompts for your store:

1. Product Page Conversion Audit
Analyse this product page and identify every source of conversion friction in detail.

2. Cart Abandonment Optimiser
Find friction across the cart and checkout experience, then recommend fixes.`;

    expect(assistantTextForStructuredPrompts(content, prompts)).toBe(
      "I created two reusable prompts for your store:"
    );
  });

  it("leaves an ordinary explanation unchanged", () => {
    const content = "I created two options that cover conversion and checkout.";
    expect(assistantTextForStructuredPrompts(content, prompts)).toBe(content);
  });
});
