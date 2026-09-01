import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptAgent } from "../lib/agentStore";
import type { ChatProgress } from "../lib/ollama";
import { promptStore } from "../lib/promptStore";
import { AgentChat } from "./AgentChat";

vi.mock("../lib/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ollama")>();
  return {
    ...actual,
    chat: vi.fn(),
    checkOllama: async () => ({ state: "unavailable" as const, reason: "test" }),
    getModel: () => "test-local-model",
    setModel: vi.fn(),
  };
});

vi.mock("../hooks/useModel", () => ({
  useModel: () => ({
    checking: false,
    ready: true,
    model: "test-model",
  }),
}));

vi.mock("../hooks/useCategories", () => ({
  useCategories: () => ({ categories: ["E-commerce", "Marketing"] }),
}));

const generated = [
  ["Product Page Conversion Audit", "Analyse this product page and identify conversion friction."],
  ["Cart Abandonment Optimiser", "Find friction across the cart and checkout experience."],
  ["Upsell & Cross-Sell Strategy", "Recommend relevant product bundles and contextual offers."],
  ["E-commerce A/B Test Generator", "Generate measurable experiments for the shopping journey."],
  ["Customer Retention Strategy", "Analyse opportunities to improve repeat purchases and loyalty."],
] as const;

vi.mock("../lib/chatgpt", () => ({
  chat: async (_history: unknown, progress: ChatProgress) => {
    for (const [title, content] of generated) {
      progress.intercept?.("create_prompt", {
        title,
        content,
        category: "E-commerce",
      });
    }

    // Deliberately include a duplicate plain list. The structured renderer must
    // suppress it and draw each prompt only once as an interactive row.
    return [
      {
        role: "assistant" as const,
        content: `I created 5 reusable prompts for your e-commerce agent:\n\n${generated
          .map(([title], index) => `${index + 1}. ${title}`)
          .join("\n")}`,
      },
    ];
  },
}));

const agent: PromptAgent = {
  id: "commerce-agent",
  name: "Commerce Agent",
  role: "E-commerce strategist",
  instructions: "Optimise commerce journeys.",
  defaultCategory: "E-commerce",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

function buttonWithText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text
  );
}

describe("AgentChat structured prompt flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("generates once inline, selects, categorises, saves selected, saves all, and persists", async () => {
    act(() => root.render(createElement(AgentChat, { agents: [agent] })));

    expect(container.textContent).toContain(
      "I'm building a design AI app. What prompts should I create?"
    );

    await act(async () => {
      buttonWithText(
        container,
        "I'm building a design AI app. What prompts should I create?"
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.innerHTML).toContain("inline-prompt-row");
    expect(container.querySelectorAll(".inline-prompt-row")).toHaveLength(5);

    const assistantBubble = container.querySelector(".bubble-assistant");
    expect(assistantBubble?.querySelectorAll(".inline-prompt-row")).toHaveLength(5);
    expect(container.querySelector(".proposal-tray")).toBeNull();
    expect(container.textContent).not.toContain("prompts ready to save");
    for (const [title] of generated) {
      expect(container.textContent?.split(title)).toHaveLength(2);
    }

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      '.inline-prompt-row input[type="checkbox"]'
    );
    act(() => checkboxes[0].click());
    expect(buttonWithText(container, "Save selected (4)")).toBeTruthy();

    const category = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Category for generated prompts"]'
    );
    act(() => {
      if (!category) return;
      category.value = "Marketing";
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      buttonWithText(container, "Save selected (4)")?.click();
      await vi.waitFor(() => {
        expect(container.querySelectorAll(".inline-prompt-row.is-saved")).toHaveLength(4);
      });
    });

    await act(async () => {
      buttonWithText(container, "Save all")?.click();
      await vi.waitFor(() => {
        expect(container.querySelectorAll(".inline-prompt-row.is-saved")).toHaveLength(5);
      });
    });

    const saved = promptStore
      .getAll()
      .filter((prompt) => generated.some(([title]) => title === prompt.title));
    expect(saved).toHaveLength(5);
    expect(saved.every((prompt) => prompt.category === "Marketing")).toBe(true);

    // Reading from the store again models a refreshed app loading persisted data.
    expect(
      promptStore
        .getAll()
        .filter((prompt) => generated.some(([title]) => title === prompt.title))
    ).toHaveLength(5);
  });
});
