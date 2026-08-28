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
import { agentStore, type PromptAgent } from "./agentStore";
import {
  generatePromptPack,
  PROMPT_TEMPLATES,
  type PromptTemplateId,
} from "./promptGenerator";
import { extractVariables, renderPrompt } from "./variables";

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

/** Where a tool call came from: the browser's agent, or the built-in local model. */
export type ActivitySource = "webmcp" | "local";

export type ActivityEntry = {
  id: string;
  tool: string;
  source: ActivitySource;
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

/**
 * Tool bodies are synchronous and JS is single-threaded, so a module-level
 * marker safely attributes a call to whoever invoked it.
 */
let activeSource: ActivitySource = "webmcp";

function logActivity(
  tool: string,
  input: Record<string, unknown>,
  summary: string,
  ok: boolean
) {
  const entry: ActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool,
    source: activeSource,
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
    agentId: prompt.agentId ?? null,
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

function bool(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

function summarizeAgent(agent: PromptAgent) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
    defaultCategory: agent.defaultCategory,
  };
}

/* ------------------------------------------------------------------ *
 * Tool definitions
 * ------------------------------------------------------------------ */

export const PROMPT_TOOLS: ToolDescriptor[] = [
  {
    name: "list_agents",
    description:
      "List the user's Prompt Lab agent profiles. Agents define an expert role, working style and default prompt category.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    execute: (input) => {
      const agents = agentStore.getAll().map(summarizeAgent);
      logActivity("list_agents", input, `${agents.length} agent${agents.length === 1 ? "" : "s"}`, true);
      return ok({ count: agents.length, agents });
    },
  },

  {
    name: "create_agent",
    description:
      "Create a reusable Prompt Lab agent profile that can shape generated prompts and own a collection in the library.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short, distinctive agent name." },
        role: { type: "string", description: "The expert role this agent should adopt." },
        instructions: {
          type: "string",
          description: "How the agent should reason, prioritise and format its work.",
        },
        default_category: {
          type: "string",
          description: "Default library category for prompts made by this agent.",
        },
      },
      required: ["name", "role", "instructions"],
    },
    execute: (input) => {
      const name = str(input, "name");
      const role = str(input, "role");
      const instructions = str(input, "instructions");
      if (!name || !role || !instructions) {
        logActivity("create_agent", input, "Missing required agent fields", false);
        return fail("`name`, `role` and `instructions` are required.");
      }
      const agent = agentStore.create({
        name,
        role,
        instructions,
        defaultCategory: str(input, "default_category"),
      });
      logActivity("create_agent", input, `Created agent "${agent.name}"`, true);
      return ok({ created: true, agent: summarizeAgent(agent) });
    },
  },

  {
    name: "update_agent",
    description: "Update an existing Prompt Lab agent profile. Omitted fields stay unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Agent id." },
        name: { type: "string", description: "New agent name." },
        role: { type: "string", description: "New expert role." },
        instructions: { type: "string", description: "New working instructions." },
        default_category: { type: "string", description: "New default category." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("update_agent", input, "Missing id", false);
        return fail("`id` is required.");
      }
      const updates: Partial<
        Pick<PromptAgent, "name" | "role" | "instructions" | "defaultCategory">
      > = {};
      const name = str(input, "name");
      const role = str(input, "role");
      const instructions = str(input, "instructions");
      const defaultCategory = str(input, "default_category");
      if (name) updates.name = name;
      if (role) updates.role = role;
      if (instructions) updates.instructions = instructions;
      if (defaultCategory) updates.defaultCategory = defaultCategory;
      if (Object.keys(updates).length === 0) {
        logActivity("update_agent", input, "Nothing to update", false);
        return fail("Provide at least one agent field to update.");
      }
      const agent = agentStore.update(id, updates);
      if (!agent) {
        logActivity("update_agent", input, `No agent with id ${id}`, false);
        return fail(`No agent found with id "${id}".`);
      }
      logActivity("update_agent", input, `Updated agent "${agent.name}"`, true);
      return ok({ updated: true, agent: summarizeAgent(agent) });
    },
  },

  {
    name: "generate_prompt_pack",
    description:
      "Turn a rough idea into four connected, reusable prompts shaped by one Prompt Lab agent. Saves them to the library by default.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent profile id from list_agents." },
        idea: { type: "string", description: "What the user wants to create or accomplish." },
        template: {
          type: "string",
          enum: PROMPT_TEMPLATES.map((template) => template.id),
          description: "Workflow: app, design, research or content. Defaults to app.",
        },
        audience: { type: "string", description: "Who the outcome is for." },
        platform: { type: "string", description: "Where the prompts will be used." },
        source_data: { type: "string", description: "Inputs the user can supply to the AI." },
        constraints: { type: "string", description: "Scope, time, technology or style constraints." },
        save: { type: "boolean", description: "Save all generated prompts. Defaults to true." },
      },
      required: ["agent_id", "idea"],
    },
    execute: (input) => {
      const agentId = str(input, "agent_id");
      const idea = str(input, "idea");
      const agent = agentId ? agentStore.get(agentId) : undefined;
      if (!agentId || !idea) {
        logActivity("generate_prompt_pack", input, "Missing agent_id or idea", false);
        return fail("Both `agent_id` and `idea` are required.");
      }
      if (!agent) {
        logActivity("generate_prompt_pack", input, `No agent with id ${agentId}`, false);
        return fail(`No agent found with id "${agentId}".`);
      }
      const rawTemplate = str(input, "template") ?? "app";
      const allowed = PROMPT_TEMPLATES.some((template) => template.id === rawTemplate);
      if (!allowed) {
        logActivity("generate_prompt_pack", input, `Unknown template ${rawTemplate}`, false);
        return fail("`template` must be app, design, research or content.");
      }
      const generated = generatePromptPack(
        {
          idea,
          audience: str(input, "audience") ?? "",
          platform: str(input, "platform") ?? "",
          sourceData: str(input, "source_data") ?? "",
          constraints: str(input, "constraints") ?? "",
          templateId: rawTemplate as PromptTemplateId,
        },
        agent
      );
      const shouldSave = bool(input, "save") ?? true;
      const prompts = shouldSave
        ? generated.map((item) =>
            promptStore.create({
              title: item.title,
              content: item.content,
              category: item.category,
              agentId: agent.id,
            })
          )
        : generated;
      logActivity(
        "generate_prompt_pack",
        input,
        `${shouldSave ? "Generated and saved" : "Generated"} ${prompts.length} prompts with "${agent.name}"`,
        true
      );
      return ok({ generated: prompts.length, saved: shouldSave, prompts });
    },
  },

  {
    name: "delete_agent",
    description:
      "Permanently delete an agent profile. Its saved prompts remain in the library without an active owner.",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the agent to delete." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("delete_agent", input, "Missing id", false);
        return fail("`id` is required.");
      }
      const agent = agentStore.get(id);
      if (!agent) {
        logActivity("delete_agent", input, `No agent with id ${id}`, false);
        return fail(`No agent found with id "${id}".`);
      }
      agentStore.remove(id);
      logActivity("delete_agent", input, `Deleted agent "${agent.name}"`, true);
      return ok({ deleted: true, id, name: agent.name });
    },
  },

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
        agent_id: {
          type: "string",
          description: "Optional agent id to restrict results to one collection.",
        },
      },
    },
    execute: (input) => {
      const query = str(input, "query");
      const limit = num(input, "limit") ?? 10;
      const agentId = str(input, "agent_id");

      const matches = query ? promptStore.search(query) : promptStore.getAll();
      const found = agentId
        ? matches.filter((prompt) => prompt.agentId === agentId)
        : matches;
      const results = found.slice(0, Math.max(1, limit)).map(summarize);

      logActivity(
        "search_prompts",
        input,
        `${results.length} result${results.length === 1 ? "" : "s"} for "${query ?? "all prompts"}"${agentId ? ` in agent ${agentId}` : ""}`,
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
      return ok({ ...prompt, variables: extractVariables(prompt.content) });
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
        agent_id: {
          type: "string",
          description: "Optional owner agent id from list_agents.",
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
        agentId: str(input, "agent_id"),
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
        agent_id: { type: "string", description: "New owner agent id." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("update_prompt", input, "Missing id", false);
        return fail("`id` is required.");
      }

      const updates: Partial<Pick<Prompt, "title" | "content" | "category" | "agentId">> =
        {};
      const title = str(input, "title");
      const content = str(input, "content");
      const category = str(input, "category");
      const agentId = str(input, "agent_id");

      if (title) updates.title = title;
      if (content) updates.content = content;
      if (category) updates.category = category;
      if (agentId) updates.agentId = agentId;

      if (Object.keys(updates).length === 0) {
        logActivity("update_prompt", input, "Nothing to update", false);
        return fail("Provide at least one of `title`, `content`, `category` or `agent_id`.");
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

  {
    name: "render_prompt",
    description:
      "Fill in a prompt's {{placeholders}} and return the finished, ready-to-use text. Records the use automatically. Call get_prompt first to see which variables a prompt needs.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the prompt to render." },
        variables: {
          type: "object",
          description:
            'Values keyed by placeholder name, e.g. {"product": "Prompt Lab"}.',
          additionalProperties: { type: "string" },
        },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("render_prompt", input, "Missing id", false);
        return fail("`id` is required.");
      }

      const prompt = promptStore.get(id);
      if (!prompt) {
        logActivity("render_prompt", input, `No prompt with id ${id}`, false);
        return fail(`No prompt found with id "${id}".`);
      }

      const raw = input.variables;
      const values: Record<string, string> = {};
      if (raw && typeof raw === "object") {
        for (const [key, value] of Object.entries(raw as object)) {
          if (typeof value === "string") values[key] = value;
        }
      }

      const needed = extractVariables(prompt.content);
      const unfilled = needed.filter((name) => !values[name]);
      const text = renderPrompt(prompt.content, values);

      promptStore.recordUse(id);

      logActivity(
        "render_prompt",
        input,
        unfilled.length
          ? `Rendered "${prompt.title}" — ${unfilled.length} placeholder(s) left`
          : `Rendered "${prompt.title}"`,
        true
      );

      return ok({
        title: prompt.title,
        text,
        variablesFilled: Object.keys(values),
        variablesMissing: unfilled,
      });
    },
  },

  {
    name: "delete_prompt",
    description:
      "Permanently remove a prompt from the Prompt Lab library. Confirm with the user before calling this — it cannot be undone.",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the prompt to delete." },
      },
      required: ["id"],
    },
    execute: (input) => {
      const id = str(input, "id");
      if (!id) {
        logActivity("delete_prompt", input, "Missing id", false);
        return fail("`id` is required.");
      }

      const prompt = promptStore.get(id);
      if (!prompt) {
        logActivity("delete_prompt", input, `No prompt with id ${id}`, false);
        return fail(`No prompt found with id "${id}".`);
      }

      promptStore.remove(id);
      logActivity("delete_prompt", input, `Deleted "${prompt.title}"`, true);
      return ok({ deleted: true, id, title: prompt.title });
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


/**
 * Runs a registered tool by name, attributing the call to `source` in the
 * activity feed. Used by the built-in local agent so it exercises exactly the
 * same tool implementations the browser's agent does.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  source: ActivitySource = "local"
): Promise<ToolResult> {
  const tool = PROMPT_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return fail(`Unknown tool "${name}".`);

  const previous = activeSource;
  activeSource = source;
  try {
    return await tool.execute(input, {});
  } finally {
    activeSource = previous;
  }
}
