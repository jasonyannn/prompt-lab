import type { DatabaseSync } from "node:sqlite";

/**
 * Just enough of the D1 API over Node's built-in SQLite for the code paths in
 * database.ts and usage.ts. Used by `npm run dev`, which has no D1 binding but
 * still records model usage to a local file, and by the server tests.
 *
 * Takes an open database rather than importing node:sqlite itself: the module
 * only exists on Node 22+, so callers import it lazily and can fall back.
 */
export function createSqliteD1(database: DatabaseSync): D1Database {
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        bound = values;
        return statement;
      },
      run: async () => {
        database.prepare(sql).run(...(bound as never[]));
        return { success: true };
      },
      all: async () => ({ results: database.prepare(sql).all(...(bound as never[])) }),
      first: async () => database.prepare(sql).get(...(bound as never[])) ?? null,
    };
    return statement;
  };
  return {
    prepare,
    // Sequential, not transactional like real D1 — fine for schema setup and logging.
    batch: async (statements: { run(): Promise<unknown> }[]) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
    exec: async (sql: string) => database.exec(sql),
  } as unknown as D1Database;
}
