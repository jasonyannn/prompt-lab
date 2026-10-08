import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "./database";

/** Minimal D1 stand-in: counts upserts per (ip, window) and accepts the rest. */
function counterDb() {
  const counts = new Map<string, number>();
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        bound = values;
        return statement;
      },
      first: async () => {
        if (!/INSERT INTO model_rate_limits/.test(sql)) return null;
        const key = `${bound[0]}|${bound[1]}`;
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return { count: next };
      },
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
    };
    return statement;
  };
  return { prepare, batch: async () => [], exec: async () => ({}) } as unknown as D1Database;
}

describe("consumeRateLimit", () => {
  const now = new Date("2026-10-08T10:15:00.000Z");

  it("allows calls up to the limit and refuses the next", async () => {
    const db = counterDb();
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeRateLimit(db, "1.2.3.4", 3, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2].remaining).toBe(0);
  });

  it("counts each IP separately", async () => {
    const db = counterDb();
    await consumeRateLimit(db, "1.1.1.1", 1, now);
    expect((await consumeRateLimit(db, "2.2.2.2", 1, now)).allowed).toBe(true);
  });

  it("starts a fresh window each hour and reports time to reset", async () => {
    const db = counterDb();
    await consumeRateLimit(db, "ip", 1, now);
    const blocked = await consumeRateLimit(db, "ip", 1, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(45 * 60);
    const nextHour = await consumeRateLimit(db, "ip", 1, new Date("2026-10-08T11:00:01.000Z"));
    expect(nextHour.allowed).toBe(true);
  });
});
