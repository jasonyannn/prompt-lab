import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatPrompt } from "../lib/ollama";
import { InlinePromptSelector } from "./InlinePromptSelector";

const prompts: ChatPrompt[] = [
  {
    id: "conversion",
    title: "Product Page Conversion Audit",
    prompt: "Analyse this product page and identify conversion friction.",
    category: "E-commerce",
    selected: true,
  },
  {
    id: "checkout",
    title: "Cart Abandonment Optimiser",
    prompt: "Find friction across the cart and checkout experience.",
    category: "E-commerce",
    selected: true,
  },
];

describe("InlinePromptSelector", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders one keyboard-accessible checkbox per unsaved prompt", () => {
    act(() => {
      root.render(
        createElement(InlinePromptSelector, {
          prompts,
          categories: ["E-commerce", "Marketing"],
          category: "E-commerce",
          saving: false,
          onCategoryChange: vi.fn(),
          onCreateCategory: vi.fn(() => null),
          onToggle: vi.fn(),
          onSaveSelected: vi.fn(),
          onSaveAll: vi.fn(),
        })
      );
    });

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[0].getAttribute("aria-label")).toContain(
      "Product Page Conversion Audit"
    );
    expect(container.textContent).toContain("Save selected (2)");
    expect(container.textContent).not.toContain("ready to save");
  });

  it("routes selection, category, save-selected, and save-all actions", () => {
    const onToggle = vi.fn();
    const onCategoryChange = vi.fn();
    const onSaveSelected = vi.fn();
    const onSaveAll = vi.fn();

    act(() => {
      root.render(
        createElement(InlinePromptSelector, {
          prompts,
          categories: ["E-commerce", "Marketing"],
          category: "E-commerce",
          saving: false,
          onCategoryChange,
          onCreateCategory: vi.fn(() => null),
          onToggle,
          onSaveSelected,
          onSaveAll,
        })
      );
    });

    const firstCheckbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    const category = container.querySelector<HTMLSelectElement>("select");
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];

    act(() => firstCheckbox?.click());
    expect(onToggle).toHaveBeenCalledWith("conversion", false);

    act(() => {
      if (!category) return;
      category.value = "Marketing";
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCategoryChange).toHaveBeenCalledWith("Marketing");

    act(() => buttons.find((button) => button.textContent?.startsWith("Save selected"))?.click());
    act(() => buttons.find((button) => button.textContent === "Save all")?.click());
    expect(onSaveSelected).toHaveBeenCalledOnce();
    expect(onSaveAll).toHaveBeenCalledOnce();
  });

  it("keeps saved rows in place and disables actions while saving", () => {
    act(() => {
      root.render(
        createElement(InlinePromptSelector, {
          prompts: [
            { ...prompts[0], selected: false, savedPromptId: "saved-conversion" },
            prompts[1],
          ],
          categories: ["E-commerce"],
          category: "E-commerce",
          saving: true,
          onCategoryChange: vi.fn(),
          onCreateCategory: vi.fn(() => null),
          onToggle: vi.fn(),
          onSaveSelected: vi.fn(),
          onSaveAll: vi.fn(),
        })
      );
    });

    expect(container.textContent).toContain("Saved");
    expect(container.textContent).toContain("Saving…");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .filter((button) => /Sav/.test(button.textContent ?? ""))
        .every((button) => button.disabled)
    ).toBe(true);
  });
});
