/**
 * Token usage tracking for the metered model routes.
 *
 * Every OpenAI call made through /api/model/* is recorded as one row in D1, and
 * an external tracker (Token Doctor) reads them back through a read-only API:
 *
 *   GET /api/usage/events   — the raw calls, oldest first, cursor-paginated
 *   GET /api/usage/summary  — totals, optionally bucketed by hour or day
 *
 * Both need `Authorization: Bearer <USAGE_API_TOKEN>`. With no valid token
 * configured the routes answer 404, so a deployment exposes nothing — not even
 * that the API exists — until someone opts in.
 * There are no CORS headers on purpose: the token belongs in the tracker's
 * server, never in a browser.
 *
 * Rows hold counts, the model, the feature, timing and a fixed error code —
 * never prompt text, upstream error text or the caller's IP — so the token only
 * ever reveals how much was spent.
 */
import { ensureDatabase } from "./database";
import { ModelCallError, type TokenUsage } from "./openai";

export type UsageFeature = "generate" | "chat";

export type UsageEvent = {
  id: string;
  at: string;
  feature: UsageFeature;
  model: string;
  ok: boolean;
  /**
   * Null when OpenAI reported no usage — the call failed or timed out first.
   * Unknown, not zero: a timed-out call may still have been billed.
   */
  usage: TokenUsage | null;
  durationMs: number;
  /** A code such as `timeout`, `rate_limited`, `upstream_400`; null on success. */
  error: string | null;
};

/** Rows older than this are pruned; a tracker is expected to pull well within it. */
export const USAGE_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_EVENT_LIMIT = 500;
const MAX_EVENT_LIMIT = 1000;
const MIN_TOKEN_LENGTH = 32;

/* ------------------------------------------------------------------ *
 * Recording
 * ------------------------------------------------------------------ */

export async function recordModelUsage(
  db: D1Database,
  event: Omit<UsageEvent, "id" | "at">,
  now = new Date()
) {
  await ensureDatabase(db);
  const cutoff = new Date(now.getTime() - USAGE_RETENTION_DAYS * DAY_MS).toISOString();
  const usage = event.usage;
  await db
    .prepare(
      `INSERT INTO model_usage
      (id, created_at, feature, model, ok, input_tokens, cached_input_tokens,
       output_tokens, reasoning_tokens, total_tokens, duration_ms, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      now.toISOString(),
      event.feature,
      event.model.slice(0, 120),
      event.ok ? 1 : 0,
      usage?.inputTokens ?? null,
      usage?.cachedInputTokens ?? null,
      usage?.outputTokens ?? null,
      usage?.reasoningTokens ?? null,
      usage?.totalTokens ?? null,
      Math.max(0, Math.round(event.durationMs)),
      event.error ? event.error.slice(0, 60) : null
    )
    .run();

  // Same trade as the rate limiter: prune now and then, not on every call.
  if (Math.random() < 0.02) {
    await db.prepare("DELETE FROM model_usage WHERE created_at < ?").bind(cutoff).run();
  }
}

export type MeterOptions = {
  /**
   * Hands the write off so the response does not wait on D1 — the worker passes
   * `ctx.waitUntil`. Without it the write is awaited, which tests rely on.
   */
  defer?: (work: Promise<unknown>) => void;
  clock?: () => number;
};

/**
 * Runs one model call and records it, whether it succeeds or fails. Recording
 * is best-effort: a D1 hiccup is logged and never fails the user's request.
 */
export async function meterModelCall<
  T extends { model: string; usage: TokenUsage | null },
>(
  db: D1Database | undefined,
  feature: UsageFeature,
  fallbackModel: string,
  run: () => Promise<T>,
  { defer, clock = Date.now }: MeterOptions = {}
): Promise<T> {
  const started = clock();
  const record = async (event: Omit<UsageEvent, "id" | "at" | "feature" | "durationMs">) => {
    if (!db) return;
    // Duration is taken now, not when a deferred write gets round to running.
    const write = recordModelUsage(db, {
      ...event,
      feature,
      durationMs: clock() - started,
    }).catch((error) => console.error("[usage:record]", error));
    if (defer) defer(write);
    else await write;
  };

  try {
    const result = await run();
    await record({ model: result.model, usage: result.usage, ok: true, error: null });
    return result;
  } catch (error) {
    const failure = error instanceof ModelCallError ? error : null;
    await record({
      model: failure?.model || fallbackModel,
      usage: failure?.usage ?? null,
      ok: false,
      error: failure?.code ?? "unknown",
    });
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Authorisation
 * ------------------------------------------------------------------ */

/** Compares digests rather than strings so timing reveals nothing about the token. */
async function sameSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all(
    [a, b].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value)))
  );
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < x.length; index += 1) difference |= x[index] ^ y[index];
  return difference === 0;
}

export type UsageAuthFailure = { status: 401 | 404; error: string };

/**
 * Off or misconfigured looks identical to a route that does not exist, so a
 * scanner learns nothing; the reason goes to the worker log instead.
 */
export async function authorizeUsageRequest(
  request: Request,
  configuredToken: string | undefined
): Promise<UsageAuthFailure | null> {
  const expected = configuredToken?.trim() ?? "";
  if (expected.length < MIN_TOKEN_LENGTH) {
    if (expected) {
      console.warn(
        `[usage] USAGE_API_TOKEN is under ${MIN_TOKEN_LENGTH} characters; the usage API stays off.`
      );
    }
    return { status: 404, error: "Not found." };
  }
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !(await sameSecret(match[1].trim(), expected))) {
    return { status: 401, error: "Missing or invalid usage API token." };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Query parsing
 * ------------------------------------------------------------------ */

export type UsageWindow = { since: string; until: string };

function parseInstant(value: string | null, name: string): Date | string | null {
  if (value === null || value.trim() === "") return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime())
    ? `\`${name}\` must be an ISO 8601 date or time, e.g. 2026-11-01T00:00:00Z.`
    : date;
}

/**
 * Reads `since` / `until` (ISO); defaults to the last 7 days. Both are clamped
 * to the retention window (and at most a day ahead), which also keeps them
 * inside four-digit years — beyond that toISOString() writes `+275760-…`, which
 * breaks the string ordering the queries rely on, or throws outright.
 */
export function parseUsageWindow(params: URLSearchParams, now = new Date()): UsageWindow | string {
  const since = parseInstant(params.get("since"), "since");
  if (typeof since === "string") return since;
  const until = parseInstant(params.get("until"), "until");
  if (typeof until === "string") return until;

  const floor = now.getTime() - (USAGE_RETENTION_DAYS + 1) * DAY_MS;
  const ceiling = now.getTime() + DAY_MS;
  const end = Math.min(until?.getTime() ?? now.getTime(), ceiling);
  const start = Math.max(since?.getTime() ?? end - DEFAULT_WINDOW_DAYS * DAY_MS, floor);
  if (start >= end) return "`since` must be before `until`, and within the last 90 days.";
  // Stored timestamps are toISOString(), so normalising makes string order = time order.
  return { since: new Date(start).toISOString(), until: new Date(end).toISOString() };
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

type UsageRow = {
  id: string;
  created_at: string;
  feature: string;
  model: string;
  ok: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number;
  error: string | null;
};

function toEvent(row: UsageRow): UsageEvent {
  return {
    id: row.id,
    at: row.created_at,
    feature: row.feature as UsageFeature,
    model: row.model,
    ok: Boolean(row.ok),
    usage:
      row.input_tokens === null && row.output_tokens === null
        ? null
        : {
            inputTokens: row.input_tokens ?? 0,
            cachedInputTokens: row.cached_input_tokens ?? 0,
            outputTokens: row.output_tokens ?? 0,
            reasoningTokens: row.reasoning_tokens ?? 0,
            totalTokens: row.total_tokens ?? 0,
          },
    durationMs: row.duration_ms,
    error: row.error,
  };
}

/** Cursor is `<created_at>|<id>` of the last event returned, so ties never skip rows. */
function readCursor(value: string | null) {
  if (!value) return null;
  const [at, id] = value.split("|");
  return at && id ? { at, id } : null;
}

export async function listModelUsage(
  db: D1Database,
  window: UsageWindow,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<{ events: UsageEvent[]; nextCursor: string | null }> {
  await ensureDatabase(db);
  const limit = Math.max(
    1,
    Math.min(MAX_EVENT_LIMIT, Math.round(options.limit ?? DEFAULT_EVENT_LIMIT) || DEFAULT_EVENT_LIMIT)
  );
  const cursor = readCursor(options.cursor ?? null);

  const conditions = ["created_at >= ?", "created_at < ?"];
  const values: unknown[] = [window.since, window.until];
  if (cursor) {
    conditions.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.at, cursor.at, cursor.id);
  }

  // One extra row says whether another page exists without a COUNT query.
  const result = await db
    .prepare(
      `SELECT * FROM model_usage WHERE ${conditions.join(" AND ")}
       ORDER BY created_at ASC, id ASC LIMIT ?`
    )
    .bind(...values, limit + 1)
    .all<UsageRow>();

  const rows = result.results.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    events: rows.map(toEvent),
    nextCursor: result.results.length > limit && last ? `${last.created_at}|${last.id}` : null,
  };
}

export type UsageInterval = "hour" | "day";

export type UsageTotals = {
  calls: number;
  errors: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  avgDurationMs: number;
};

export type UsageBreakdownRow = UsageTotals & {
  /** Start of the bucket (ISO), present only when an interval was requested. */
  period?: string;
  feature: string;
  model: string;
};

type SummaryRow = {
  period: string | null;
  feature: string;
  model: string;
  calls: number;
  errors: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  duration_ms: number;
};

export function parseInterval(
  value: string | null
): { interval: UsageInterval | null } | { error: string } {
  if (!value) return { interval: null };
  if (value === "hour" || value === "day") return { interval: value };
  return { error: "`interval` must be `hour` or `day`." };
}

export async function summarizeModelUsage(
  db: D1Database,
  window: UsageWindow,
  interval: UsageInterval | null = null
): Promise<{ totals: UsageTotals; breakdown: UsageBreakdownRow[] }> {
  await ensureDatabase(db);
  // ISO strings bucket by prefix: 13 chars is the hour, 10 the day.
  const period =
    interval === "hour"
      ? "substr(created_at, 1, 13) || ':00:00.000Z'"
      : interval === "day"
        ? "substr(created_at, 1, 10) || 'T00:00:00.000Z'"
        : "NULL";

  const result = await db
    .prepare(
      `SELECT ${period} AS period, feature, model,
        COUNT(*) AS calls,
        SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS errors,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(duration_ms), 0) AS duration_ms
      FROM model_usage
      WHERE created_at >= ? AND created_at < ?
      GROUP BY period, feature, model
      ORDER BY period ASC, feature ASC, model ASC`
    )
    .bind(window.since, window.until)
    .all<SummaryRow>();

  const totals = { calls: 0, errors: 0, input: 0, cached: 0, output: 0, reasoning: 0, total: 0, duration: 0 };
  const breakdown = result.results.map((row): UsageBreakdownRow => {
    totals.calls += row.calls;
    totals.errors += row.errors;
    totals.input += row.input_tokens;
    totals.cached += row.cached_input_tokens;
    totals.output += row.output_tokens;
    totals.reasoning += row.reasoning_tokens;
    totals.total += row.total_tokens;
    totals.duration += row.duration_ms;
    return {
      ...(row.period ? { period: row.period } : {}),
      feature: row.feature,
      model: row.model,
      calls: row.calls,
      errors: row.errors,
      inputTokens: row.input_tokens,
      cachedInputTokens: row.cached_input_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      totalTokens: row.total_tokens,
      avgDurationMs: row.calls ? Math.round(row.duration_ms / row.calls) : 0,
    };
  });

  return {
    totals: {
      calls: totals.calls,
      errors: totals.errors,
      inputTokens: totals.input,
      cachedInputTokens: totals.cached,
      outputTokens: totals.output,
      reasoningTokens: totals.reasoning,
      totalTokens: totals.total,
      avgDurationMs: totals.calls ? Math.round(totals.duration / totals.calls) : 0,
    },
    breakdown,
  };
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

function respond(payload: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(payload, null, 2), { ...init, headers });
}

/**
 * Serves /api/usage/*. Shared by the worker (server/index.ts) and the dev
 * server (vite.config.ts), so local and deployed behave the same. Server-to-
 * server only: no CORS headers, so a browser page cannot read it even with the
 * token.
 */
export async function handleUsageRequest(
  request: Request,
  env: { DB?: D1Database; USAGE_API_TOKEN?: string }
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET") {
    return respond({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
  }
  const denied = await authorizeUsageRequest(request, env.USAGE_API_TOKEN);
  if (denied) {
    return respond(
      { error: denied.error },
      {
        status: denied.status,
        headers: denied.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined,
      }
    );
  }
  if (!env.DB) {
    return respond({ error: "Database binding unavailable." }, { status: 503 });
  }

  const window = parseUsageWindow(url.searchParams);
  if (typeof window === "string") return respond({ error: window }, { status: 400 });

  if (url.pathname === "/api/usage/events") {
    const limit = Number(url.searchParams.get("limit") ?? "");
    const page = await listModelUsage(env.DB, window, {
      cursor: url.searchParams.get("cursor"),
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    });
    return respond({
      ...window,
      retentionDays: USAGE_RETENTION_DAYS,
      count: page.events.length,
      nextCursor: page.nextCursor,
      events: page.events,
    });
  }

  if (url.pathname === "/api/usage/summary") {
    const parsed = parseInterval(url.searchParams.get("interval"));
    if ("error" in parsed) return respond({ error: parsed.error }, { status: 400 });
    const { interval } = parsed;
    const summary = await summarizeModelUsage(env.DB, window, interval);
    return respond({
      ...window,
      interval,
      retentionDays: USAGE_RETENTION_DAYS,
      ...summary,
    });
  }

  return respond({ error: "Not found." }, { status: 404 });
}
