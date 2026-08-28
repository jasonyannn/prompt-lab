/**
 * WebMCP integration layer.
 *
 * This registers real tools against the browser's native `document.modelContext`
 * (the W3C WebMCP imperative API). Nothing here simulates or proxies MCP — if the
 * browser does not implement `modelContext`, registration is skipped and the UI
 * reports "unavailable" instead of faking it.
 *
 * Spec: https://github.com/webmachinelearning/webmcp
 */

import { promptStore, type Prompt } from "./promptStore";

/* ------------------------------------------------------------------ *
 * Ambient types for the WebMCP surface
 * ------------------------------------------------------------------ */

export type ToolContent = { type: "text"; text: string };

export type ToolResult = {
  content: ToolContent[];
  isError?: boolean;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    context?: { signal?: AbortSignal }
  ) => Promise<ToolResult> | ToolResult;
};

export type ModelContext = {
  registerTool: (
    tool: ToolDescriptor,
    options?: { signal?: AbortSignal; exposedTo?: string[] }
  ) => Promise<unknown> | unknown;
  provideContext?: (context: { tools: ToolDescriptor[] }) => unknown;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    /** Pre-Chrome-150 location of the same API. Read-only fallback. */
    modelContext?: ModelContext;
  }
}

/** Returns the live model context, or null when the browser has no WebMCP support. */
export function getModelContext(): ModelContext | null {
  if (typeof document !== "undefined" && document.modelContext) {
    return document.modelContext;
  }
  // Legacy namespace kept only as a fallback; never a custom implementation.
  if (typeof navigator !== "undefined" && navigator.modelContext) {
    return navigator.modelContext;
  }
  return null;
}

export function isWebMCPAvailable(): boolean {
  return getModelContext() !== null;
}

/* ------------------------------------------------------------------ *
 * Agent activity log
 * ------------------------------------------------------------------ */

export type ActivityEntry = {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  ok: boolean;
  at: string;
};

const MAX_ACTIVITY = 25;

let activity: ActivityEntry[] = [];
const listeners = new Set<(entries: ActivityEntry[]) => void>();

export function getActivity(): ActivityEntry[] {
  return activity;
}

export function subscribeToActivity(
  listener: (entries: ActivityEntry[]) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function logActivity(
  tool: string,
  input: Record<string, unknown>,
  summary: string,
  ok: boolean
) {
  const entry: ActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool,
    input,
    summary,
    ok,
    at: new Date().toISOString(),
  };

  activity = [entry, ...activity].slice(0, MAX_ACTIVITY);
  listeners.forEach((listener) => listener(activity));
}

export function clearActivity() {
  activity = [];
  listeners.forEach((listener) => listener(activity));
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function ok(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Trim prompt bodies in list responses so agents get a scannable result set. */
function summarize(prompt: Prompt) {
  return {
    id: prompt.id,
    title: prompt.title,
    category: prompt.category,
    rating: prompt.rating ?? null,
    usageCount: prompt.usageCount,
    preview:
      prompt.content.length > 160
        ? `${prompt.content.slice(0, 160)}…`
        : prompt.content,
  };
}

function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/* ------------------------------------------------------------------ *
 * Tool definitions
 * ------------------------------------------------------------------ */

export const PROMPT_TOOLS: ToolDescriptor[] = [
  {
    name: "search_prompts",
    description:
      "Search the Prompt Lab library for reusable prompts by keyword. Matches title, body and category. Returns previews — call get_prompt for the full text.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords to search for, e.g. 'ux audit'. Omit to list every prompt.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10.",
        },
      },
    },
    execute: (input) => {
      const query = str(input, "query");
      const limit = num(input, "limit") ?? 10;

      const found = query ? promptStore.search(query) : promptStore.getAll();
      const results = found.slice(0, Math.max(1, limit)).map(summarize);

      logActivity(
        "search_prompts",
        input,
        `${results.length} result${results.length === 1 ? "" : "s"} for "${query ?? "all prompts"}"`,
        true
      );

      return ok({ count: results.length, results });
    },
  },

  {
    name: "get_prompt",
    description:
      "Retrieve one prompt from Prompt Lab in full, including its complete prompt text, category, rating and usage count.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the prompt to fetch." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("get_prompt", input, "Missing id", false);
        return fail("`id` is required.");
      }

      const prompt = promptStore.get(id);
      if (!prompt) {
        logActivity("get_prompt", input, `No prompt with id ${id}`, false);
        return fail(`No prompt found with id "${id}".`);
      }

      logActivity("get_prompt", input, `Read "${prompt.title}"`, true);
      return ok(prompt);
    },
  },

  {
    name: "create_prompt",
    description:
      "Save a new reusable prompt into the Prompt Lab library. Use this when the user has written or refined a prompt worth keeping.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive name." },
        content: { type: "string", description: "The full prompt text." },
        category: {
          type: "string",
          description:
            "Grouping such as Design, Product, Engineering, Marketing. Defaults to General.",
        },
      },
      required: ["title", "content"],
    },
    execute: (input) => {
      const title = str(input, "title");
      const content = str(input, "content");

      if (!title || !content) {
        logActivity("create_prompt", input, "Missing title or content", false);
        return fail("Both `title` and `content` are required.");
      }

      const prompt = promptStore.create({
        title,
        content,
        category: str(input, "category"),
      });

      logActivity("create_prompt", input, `Created "${prompt.title}"`, true);
      return ok({ created: true, prompt });
    },
  },

  {
    name: "update_prompt",
    description:
      "Edit an existing Prompt Lab prompt. Only the fields you pass are changed — omit the rest.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the prompt to update." },
        title: { type: "string", description: "New title." },
        content: { type: "string", description: "New prompt text." },
        category: { type: "string", description: "New category." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("update_prompt", input, "Missing id", false);
        return fail("`id` is required.");
      }

      const updates: Partial<Pick<Prompt, "title" | "content" | "category">> =
        {};
      const title = str(input, "title");
      const content = str(input, "content");
      const category = str(input, "category");

      if (title) updates.title = title;
      if (content) updates.content = content;
      if (category) updates.category = category;

      if (Object.keys(updates).length === 0) {
        logActivity("update_prompt", input, "Nothing to update", false);
        return fail("Provide at least one of `title`, `content` or `category`.");
      }

      const prompt = promptStore.update(id, updates);
      if (!prompt) {
        logActivity("update_prompt", input, `No prompt with id ${id}`, false);
        return fail(`No prompt found with id "${id}".`);
      }

      logActivity(
        "update_prompt",
        input,
        `Updated ${Object.keys(updates).join(", ")} on "${prompt.title}"`,
        true
      );
      return ok({ updated: true, prompt });
    },
  },

  {
    name: "rate_prompt",
    description:
      "Rate how well a Prompt Lab prompt performed, from 1 to 5. Use after the user reports whether a prompt worked.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the prompt to rate." },
        rating: {
          type: "number",
          description: "Rating between 1 and 5. Decimals allowed.",
        },
      },
      required: ["id", "rating"],
    },
    execute: (input) => {
      const id = str(input, "id");
      const rating = num(input, "rating");

      if (!id || rating === undefined) {
        logActivity("rate_prompt", input, "Missing id or rating", false);
        return fail("Both `id` and a numeric `rating` are required.");
      }

      if (rating < 1 || rating > 5) {
        logActivity("rate_prompt", input, `Rating ${rating} out of range`, false);
        return fail("`rating` must be between 1 and 5.");
      }

      const prompt = promptStore.update(id, {
        rating: Math.round(rating * 10) / 10,
      });

      if (!prompt) {
        logActivity("rate_prompt", input, `No prompt with id ${id}`, false);
        return fail(`No prompt found with id "${id}".`);
      }

      logActivity(
        "rate_prompt",
        input,
        `Rated "${prompt.title}" ${prompt.rating}/5`,
        true
      );
      return ok({ rated: true, prompt });
    },
  },

  {
    name: "record_prompt_use",
    description:
      "Record that a Prompt Lab prompt was actually used, incrementing its usage count. Call this whenever you hand one of these prompts to the user or reuse it yourself.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the prompt that was used." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("record_prompt_use", input, "Missing id", false);
        return fail("`id` is required.");
      }

      const prompt = promptStore.recordUse(id);
      if (!prompt) {
        logActivity("record_prompt_use", input, `No prompt with id ${id}`, false);
        return fail(`No prompt found with id "${id}".`);
      }

      logActivity(
        "record_prompt_use",
        input,
        `"${prompt.title}" used ${prompt.usageCount}×`,
        true
      );
      return ok({ recorded: true, usageCount: prompt.usageCount, prompt });
    },
  },
];

export const TOOL_NAMES = PROMPT_TOOLS.map((tool) => tool.name);

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

/**
 * Registers every Prompt Lab tool with the browser's model context.
 * Returns an AbortController — abort it to unregister the whole set.
 * Returns null when the browser has no WebMCP support.
 */
export async function registerPromptTools(): Promise<AbortController | null> {
  const modelContext = getModelContext();
  if (!modelContext) return null;

  const controller = new AbortController();

  for (const tool of PROMPT_TOOLS) {
    if (controller.signal.aborted) break;
    try {
      await modelContext.registerTool(tool, { signal: controller.signal });
    } catch (error) {
      // A tool that fails to register should not take the rest down with it.
      console.error(`[webmcp] failed to register "${tool.name}"`, error);
    }
  }

  return controller;
}
