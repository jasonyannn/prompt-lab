import { describe, expect, it, vi } from "vitest";
import worker from "./index";
import type { Env } from "./env";
import { createSqliteD1 } from "./localD1";
import { ModelCallError, readUsage, type TokenUsage } from "./openai";
import {
  authorizeUsageRequest,
  listModelUsage,
  meterModelCall,
  parseUsageWindow,
  recordModelUsage,
  summarizeModelUsage,
} from "./usage";

/*
 * The SQL here (cursor paging, hour/day buckets) is the part worth testing, so
 * these suites run it against real SQLite through the same D1 adapter the dev
 * server uses (localD1.ts) rather than a hand-written fake. node:sqlite ships with Node 22+; on older Node the
 * database-backed suites skip and the pure ones still run.
 */
const sqlite = await import("node:sqlite").catch(() => null);

function sqliteD1(): D1Database {
  if (!sqlite) throw new Error("node:sqlite unavailable");
  return createSqliteD1(new sqlite.DatabaseSync(":memory:"));
}

const usage: TokenUsage = {
  inputTokens: 1200,
  cachedInputTokens: 200,
  outputTokens: 300,
  reasoningTokens: 120,
  totalTokens: 1500,
};

const TOKEN = "t".repeat(40);

const withAuth = (token = TOKEN) =>
  new Request("https://lab.test/api/usage/events", {
    headers: { Authorization: `Bearer ${token}` },
  });

describe("readUsage", () => {
  it("maps the Responses API usage block", () => {
    expect(
      readUsage({
        usage: {
          input_tokens: 1200,
          input_tokens_details: { cached_tokens: 200 },
          output_tokens: 300,
          output_tokens_details: { reasoning_tokens: 120 },
          total_tokens: 1500,
        },
      })
    ).toEqual(usage);
  });

  it("returns null when usage is missing and derives a missing total", () => {
    expect(readUsage({ output: [] })).toBeNull();
    expect(readUsage({ usage: { input_tokens: 10, output_tokens: 5 } })?.totalTokens).toBe(15);
  });
});

describe("authorizeUsageRequest", () => {
  it("looks like a missing route until a long enough token is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await authorizeUsageRequest(withAuth(), undefined)).toEqual({
      status: 404,
      error: "Not found.",
    });
    expect((await authorizeUsageRequest(withAuth("short"), "short"))?.status).toBe(404);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("rejects a missing or wrong token and accepts the right one", async () => {
    const bare = new Request("https://lab.test/api/usage/events");
    expect((await authorizeUsageRequest(bare, TOKEN))?.status).toBe(401);
    expect((await authorizeUsageRequest(withAuth("x".repeat(40)), TOKEN))?.status).toBe(401);
    expect(await authorizeUsageRequest(withAuth(), TOKEN)).toBeNull();
    const lower = new Request("https://lab.test/", {
      headers: { Authorization: `bearer ${TOKEN}` },
    });
    expect(await authorizeUsageRequest(lower, TOKEN)).toBeNull();
  });
});

describe("parseUsageWindow", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");

  it("defaults to the last seven days and normalises to ISO", () => {
    expect(parseUsageWindow(new URLSearchParams(), now)).toEqual({
      since: "2026-11-07T12:00:00.000Z",
      until: "2026-11-14T12:00:00.000Z",
    });
    expect(parseUsageWindow(new URLSearchParams("since=2026-11-01"), now)).toEqual({
      since: "2026-11-01T00:00:00.000Z",
      until: "2026-11-14T12:00:00.000Z",
    });
  });

  it("clamps to the retention window, so extreme dates cannot throw", () => {
    const window = parseUsageWindow(
      new URLSearchParams("since=0001-01-01&until=%2B275760-09-13T00:00:00Z"),
      now
    );
    expect(window).toEqual({
      since: "2026-08-15T12:00:00.000Z",
      until: "2026-11-15T12:00:00.000Z",
    });
    expect(
      typeof parseUsageWindow(new URLSearchParams("until=-271821-04-20T00:00:00Z"), now)
    ).toBe("string");
  });

  it("rejects bad dates and empty ranges", () => {
    expect(typeof parseUsageWindow(new URLSearchParams("since=yesterday"), now)).toBe("string");
    expect(
      typeof parseUsageWindow(new URLSearchParams("since=2026-11-10&until=2026-11-09"), now)
    ).toBe("string");
  });
});

describe.skipIf(!sqlite)("meterModelCall", () => {
  // Explicit, because `until` is exclusive and "now" can equal the row's timestamp.
  const recent = () => ({
    since: new Date(Date.now() - 60_000).toISOString(),
    until: new Date(Date.now() + 60_000).toISOString(),
  });
  const clock = () => {
    let tick = 1000;
    return () => (tick += 250);
  };

  it("records a successful call with its tokens", async () => {
    const db = sqliteD1();
    const result = await meterModelCall(
      db,
      "chat",
      "gpt-default",
      async () => ({ output: [], model: "gpt-served", usage }),
      { clock: clock() }
    );
    expect(result.model).toBe("gpt-served");

    const { events } = await listModelUsage(db, recent());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      feature: "chat",
      model: "gpt-served",
      ok: true,
      usage,
      durationMs: 250,
      error: null,
    });
  });

  it("records billed failures with usage and unbilled ones without, then rethrows", async () => {
    const db = sqliteD1();
    await expect(
      meterModelCall(db, "generate", "gpt-default", async () => {
        throw new ModelCallError(
          "The model stopped early (max_output_tokens).",
          "incomplete:max_output_tokens",
          usage,
          "gpt-served"
        );
      })
    ).rejects.toThrow("stopped early");
    await expect(
      meterModelCall(db, "generate", "gpt-default", async () => {
        throw new ModelCallError("The model took too long to respond.", "timeout");
      })
    ).rejects.toThrow("too long");

    const { events } = await listModelUsage(db, recent());
    const byModel = Object.fromEntries(events.map((event) => [event.model, event]));
    expect(byModel["gpt-served"]).toMatchObject({
      ok: false,
      usage,
      error: "incomplete:max_output_tokens",
    });
    expect(byModel["gpt-default"]).toMatchObject({ ok: false, usage: null, error: "timeout" });
  });

  it("stores an error code, never upstream error text", async () => {
    const db = sqliteD1();
    await expect(
      meterModelCall(db, "chat", "m", async () => {
        throw new ModelCallError("Invalid value: '<script>attacker text</script>'", "upstream_400");
      })
    ).rejects.toThrow("Invalid value");
    await expect(
      meterModelCall(db, "chat", "m", async () => {
        throw new Error("something unexpected with user text in it");
      })
    ).rejects.toThrow();

    const { events } = await listModelUsage(db, recent());
    expect(events.map((event) => event.error).sort()).toEqual(["unknown", "upstream_400"]);
  });

  it("hands the write to defer instead of holding the response", async () => {
    const db = sqliteD1();
    const deferred: Promise<unknown>[] = [];
    await meterModelCall(db, "chat", "m", async () => ({ model: "m", usage }), {
      defer: (work) => deferred.push(work),
    });
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    expect((await listModelUsage(db, recent())).events).toHaveLength(1);
  });

  it("never fails the request when recording fails", async () => {
    const broken = {
      prepare: () => {
        throw new Error("D1 is down");
      },
      batch: async () => {
        throw new Error("D1 is down");
      },
    } as unknown as D1Database;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await meterModelCall(broken, "chat", "m", async () => ({
      model: "m",
      usage: null,
    }));
    expect(result.model).toBe("m");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe.skipIf(!sqlite)("reading usage", () => {
  const window = {
    since: "2026-11-01T00:00:00.000Z",
    until: "2026-11-15T00:00:00.000Z",
  };

  async function seed(db: D1Database) {
    const at = (iso: string) => new Date(iso);
    const event = (feature: "chat" | "generate", model: string, tokens: TokenUsage | null) => ({
      feature,
      model,
      ok: tokens !== null,
      usage: tokens,
      durationMs: 1000,
      error: tokens ? null : "failed",
    });
    // Three share one timestamp, so paging has to break ties by id.
    for (let i = 0; i < 3; i += 1) {
      await recordModelUsage(db, event("chat", "gpt-a", usage), at("2026-11-10T09:15:00.000Z"));
    }
    await recordModelUsage(db, event("generate", "gpt-a", usage), at("2026-11-10T10:05:00.000Z"));
    await recordModelUsage(db, event("generate", "gpt-b", null), at("2026-11-11T08:00:00.000Z"));
    // Outside the window.
    await recordModelUsage(db, event("chat", "gpt-a", usage), at("2026-10-01T00:00:00.000Z"));
  }

  it("pages through every event exactly once, oldest first", async () => {
    const db = sqliteD1();
    await seed(db);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await listModelUsage(db, window, { cursor, limit: 2 });
      seen.push(...page.events.map((event) => event.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
  });

  it("summarises totals and buckets by day", async () => {
    const db = sqliteD1();
    await seed(db);
    const { totals, breakdown } = await summarizeModelUsage(db, window, "day");

    expect(totals).toMatchObject({
      calls: 5,
      errors: 1,
      inputTokens: 4 * usage.inputTokens,
      totalTokens: 4 * usage.totalTokens,
      avgDurationMs: 1000,
    });
    expect(breakdown).toEqual([
      expect.objectContaining({ period: "2026-11-10T00:00:00.000Z", feature: "chat", model: "gpt-a", calls: 3 }),
      expect.objectContaining({ period: "2026-11-10T00:00:00.000Z", feature: "generate", model: "gpt-a", calls: 1 }),
      expect.objectContaining({ period: "2026-11-11T00:00:00.000Z", feature: "generate", model: "gpt-b", calls: 1, totalTokens: 0 }),
    ]);

    const hourly = await summarizeModelUsage(db, window, "hour");
    expect(hourly.breakdown[0].period).toBe("2026-11-10T09:00:00.000Z");
  });
});

describe.skipIf(!sqlite)("/api/usage routes", () => {
  const env = (overrides: Partial<Env> = {}) =>
    ({
      DB: sqliteD1(),
      USAGE_API_TOKEN: TOKEN,
      ASSETS: { fetch: async () => new Response("asset") },
      ...overrides,
    }) as Env;

  it("requires the token and serves events and a summary", async () => {
    const config = env();
    const unauthorised = await worker.fetch(new Request("https://lab.test/api/usage/events"), config);
    expect(unauthorised.status).toBe(401);
    expect(unauthorised.headers.get("WWW-Authenticate")).toBe("Bearer");

    const events = await worker.fetch(withAuth(), config);
    expect(events.status).toBe(200);
    expect(events.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await events.json()).toMatchObject({ count: 0, nextCursor: null, events: [] });

    const summary = await worker.fetch(
      new Request("https://lab.test/api/usage/summary?interval=day", {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      config
    );
    expect(await summary.json()).toMatchObject({ interval: "day", totals: { calls: 0 } });
  });

  it("is hidden without a token and validates its parameters", async () => {
    expect((await worker.fetch(withAuth(), env({ USAGE_API_TOKEN: undefined }))).status).toBe(404);

    const bad = await worker.fetch(
      new Request("https://lab.test/api/usage/summary?interval=week", {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      env()
    );
    expect(bad.status).toBe(400);

    const post = await worker.fetch(
      new Request("https://lab.test/api/usage/events", { method: "POST" }),
      env()
    );
    expect(post.status).toBe(405);
  });
});
