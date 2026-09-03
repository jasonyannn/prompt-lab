import { describe, expect, it } from "vitest";
import { createPromptLabMcpServer } from "./mcp";

/**
 * The remote server is exercised against a stub D1 rather than a live binding,
 * so prompt registration, naming and argument filling are covered without a
 * Cloudflare environment.
 */

const ROW = {
  id: "p-1",
  title: "Launch email",
  content: [
    "Act as a growth marketer.",
    "",
    "Objective",
    "Write a launch email that gets replies.",
    "",
    "Context I am giving you",
    "- What you are launching: {{what you are launching}}",
    "",
    "Return exactly",
    "- A subject line",
    "- A three sentence body",
  ].join("\n"),
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

type RegisteredPrompt = {
  title: string;
  description: string;
  handler: (
    args: Record<string, unknown>,
    extra: unknown
  ) => Promise<{ messages: { role: string; content: { text: string } }[] }>;
};

/** Returns the one prompt row for a prompt SELECT and nothing for anything else. */
function fakeDb(rows: (typeof ROW)[] = [ROW]) {
  const prepare = (sql: string) => {
    const isPromptSelect = /SELECT \* FROM prompts/i.test(sql);
    const statement: Record<string, unknown> = {
      bind: () => statement,
      all: async () => ({ results: isPromptSelect ? rows : [] }),
      run: async () => ({ success: true }),
      first: async () => (isPromptSelect ? (rows[0] ?? null) : null),
    };
    return statement;
  };
  return { prepare, batch: async () => [], exec: async () => ({}) };
}

function registeredPrompts(server: unknown) {
  return (server as { _registeredPrompts: Record<string, RegisteredPrompt> })
    ._registeredPrompts;
}

describe("createPromptLabMcpServer", () => {
  it("serves the saved library and the catalog as MCP prompts", async () => {
    const { server, promptCounts } = await createPromptLabMcpServer(
      fakeDb() as never
    );

    expect(promptCounts.library).toBe(1);
    expect(promptCounts.catalog).toBeGreaterThan(50);
    expect(promptCounts.total).toBe(promptCounts.library + promptCounts.catalog);

    const names = Object.keys(registeredPrompts(server));
    expect(names).toContain("launch-email");
    expect(names).toHaveLength(promptCounts.total);
  });

  it("gives every prompt a unique name so a client can address it", async () => {
    const duplicates = [ROW, { ...ROW, id: "p-2" }, { ...ROW, id: "p-3" }];
    const { server } = await createPromptLabMcpServer(
      fakeDb(duplicates) as never
    );

    const names = Object.keys(registeredPrompts(server));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("launch-email");
    expect(names).toContain("launch-email-2");
    expect(names).toContain("launch-email-3");
  });

  it("describes a saved prompt by its category and objective", async () => {
    const { server } = await createPromptLabMcpServer(fakeDb() as never);

    expect(registeredPrompts(server)["launch-email"].description).toBe(
      "Marketing · Write a launch email that gets replies."
    );
  });

  it("fills the prompt body from the client's arguments", async () => {
    const { server } = await createPromptLabMcpServer(fakeDb() as never);

    const result = await registeredPrompts(server)["launch-email"].handler(
      { what_you_are_launching: "a budgeting app" },
      {}
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain(
      "What you are launching: a budgeting app"
    );
  });

  it("leaves an unsupplied argument visible rather than blanking it", async () => {
    const { server } = await createPromptLabMcpServer(fakeDb() as never);

    const result = await registeredPrompts(server)["launch-email"].handler(
      {},
      {}
    );

    expect(result.messages[0].content.text).toContain(
      "{{what you are launching}}"
    );
  });

  it("still serves the catalog when the library is unreadable", async () => {
    const broken = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
      batch: async () => [],
      exec: async () => ({}),
    };

    const { promptCounts } = await createPromptLabMcpServer(broken as never);

    expect(promptCounts.library).toBe(0);
    expect(promptCounts.catalog).toBeGreaterThan(50);
  });

  it("registers export_prompt alongside the existing tools", async () => {
    const { server } = await createPromptLabMcpServer(fakeDb() as never);
    const tools = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    expect(Object.keys(tools)).toContain("export_prompt");
    expect(Object.keys(tools)).toContain("search_prompts");
  });
});
