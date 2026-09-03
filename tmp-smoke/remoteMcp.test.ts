import { describe, expect, it } from "vitest";
import { createPromptLabMcpServer } from "../server/mcp";

/** One saved prompt, shaped like a row from D1. */
const ROW = {
  id: "p-1",
  title: "Launch email",
  content:
    "Act as a growth marketer.\n\nObjective\nWrite a launch email that gets replies.\n\nContext I am giving you\n- What you are launching: {{what you are launching}}\n\nReturn exactly\n- A subject line\n- A three sentence body",
  category: "Marketing",
  agent_id: null,
  rating: 4.5,
  usage_count: 3,
  family_id: "f-1",
  parent_prompt_id: null,
  version_label: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function fakeDb() {
  const statement = (sql: string) => {
    const result = () =>
      /SELECT \* FROM prompts/i.test(sql)
        ? { results: [ROW] }
        : { results: [] };
    const api: Record<string, unknown> = {
      bind: () => api,
      all: async () => result(),
      run: async () => ({ success: true }),
      first: async () => (/SELECT \* FROM prompts/i.test(sql) ? ROW : null),
    };
    return api;
  };
  return { prepare: statement, batch: async () => [], exec: async () => ({}) };
}

describe("remote MCP prompts", () => {
  it("registers saved prompts and the catalog as MCP prompts", async () => {
    const { server, promptCounts } = await createPromptLabMcpServer(
      fakeDb() as never
    );

    expect(promptCounts.library).toBe(1);
    expect(promptCounts.catalog).toBeGreaterThan(50);
    expect(promptCounts.total).toBe(
      promptCounts.library + promptCounts.catalog
    );

    // The SDK keeps registered prompts on the server instance.
    const registered = (server as never as {
      _registeredPrompts: Record<string, unknown>;
    })._registeredPrompts;
    const names = Object.keys(registered ?? {});
    expect(names).toContain("launch-email");
    expect(names.length).toBe(promptCounts.total);
    // Names must be unique or a client cannot address them.
    expect(new Set(names).size).toBe(names.length);
  });

  it("renders a prompt body with the client's arguments", async () => {
    const { server } = await createPromptLabMcpServer(fakeDb() as never);
    const registered = (server as never as {
      _registeredPrompts: Record<string, { callback: Function }>;
    })._registeredPrompts;

    const result = await registered["launch-email"].callback(
      { what_you_are_launching: "a budgeting app" },
      {}
    );

    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain(
      "What you are launching: a budgeting app"
    );
  });

  it("exposes export_prompt alongside the existing tools", async () => {
    const { server } = await createPromptLabMcpServer(fakeDb() as never);
    const tools = (server as never as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    expect(Object.keys(tools)).toContain("export_prompt");
  });
});
