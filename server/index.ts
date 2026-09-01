import { createMcpHandler } from "@modelcontextprotocol/server";
import { ensureDatabase, listRemoteActivity } from "./database";
import { createPromptLabMcpServer, REMOTE_TOOL_NAMES } from "./mcp";
import {
  chatWithModel,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  generateWithModel,
  parseChatRequest,
  parseGenerateRequest,
} from "./openai";
import type { Env } from "./env";

function json(payload: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(payload, null, 2), { ...init, headers });
}

function allowedOrigins(request: Request, env: Env) {
  const origins = new Set([new URL(request.url).origin]);
  for (const value of (env.PROMPTLAB_ALLOWED_ORIGINS ?? "").split(",")) {
    const origin = value.trim();
    if (origin) origins.add(origin);
  }
  return origins;
}

function rejectInvalidOrigin(request: Request, env: Env): Response | null {
  const origin = request.headers.get("Origin");
  if (!origin || allowedOrigins(request, env).has(origin)) return null;
  return json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Origin is not allowed." },
      id: null,
    },
    { status: 403 }
  );
}

function corsHeaders(request: Request, env: Env) {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins(request, env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    [
      "Accept",
      "Authorization",
      "Content-Type",
      "Last-Event-ID",
      "MCP-Protocol-Version",
      "Mcp-Method",
      "Mcp-Name",
      "Mcp-Session-Id",
    ].join(", ")
  );
  headers.set(
    "Access-Control-Expose-Headers",
    "MCP-Protocol-Version, Mcp-Session-Id"
  );
  return headers;
}

function withHeaders(response: Response, extra: Headers) {
  const headers = new Headers(response.headers);
  extra.forEach((value, key) => headers.set(key, value));
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleMcp(request: Request, env: Env) {
  const rejected = rejectInvalidOrigin(request, env);
  if (rejected) return rejected;
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (!env.DB) {
    return json({ error: "Prompt Lab's database binding is unavailable." }, { status: 503 });
  }

  const handler = createMcpHandler(
    () => createPromptLabMcpServer(env.DB),
    {
      legacy: "stateless",
      onerror: (error) => console.error("[remote-mcp]", error),
    }
  );
  const response = await handler.fetch(request);
  return withHeaders(response, cors);
}

async function handleApi(request: Request, env: Env, pathname: string) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }
  if (!env.DB) {
    return json({ ready: false, error: "Database binding unavailable." }, { status: 503 });
  }
  await ensureDatabase(env.DB);

  if (pathname === "/api/mcp/status") {
    const origin = new URL(request.url).origin;
    return json({
      ready: true,
      name: "Prompt Lab",
      // Trailing slash is required: the Sites edge answers a bare /mcp with its
      // own 404 before the request reaches this worker, so only /mcp/ connects.
      endpoint: `${origin}/mcp/`,
      transport: "Streamable HTTP",
      protocolVersions: ["2026-07-28", "2025-11-25"],
      persistence: "Cloudflare D1",
      authentication: "none — shared hackathon demo library",
      toolCount: REMOTE_TOOL_NAMES.length,
      tools: REMOTE_TOOL_NAMES,
    });
  }

  if (pathname === "/api/mcp/activity") {
    const requested = Number(new URL(request.url).searchParams.get("limit") ?? 25);
    const activity = await listRemoteActivity(
      env.DB,
      Number.isFinite(requested) ? requested : 25
    );
    return json({ count: activity.length, activity });
  }

  return json({ error: "Not found." }, { status: 404 });
}

async function handleModel(request: Request, env: Env, pathname: string) {
  const rejected = rejectInvalidOrigin(request, env);
  if (rejected) return rejected;
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const model = env.OPENAI_MODEL || DEFAULT_MODEL;

  if (pathname === "/api/model/status") {
    return withHeaders(
      json({ ready: Boolean(env.OPENAI_API_KEY), model }),
      cors
    );
  }

  if (pathname !== "/api/model/generate" && pathname !== "/api/model/chat") {
    return withHeaders(json({ error: "Not found." }, { status: 404 }), cors);
  }
  if (request.method !== "POST") {
    return withHeaders(
      json({ error: "Method not allowed." }, { status: 405 }),
      cors
    );
  }
  if (!env.OPENAI_API_KEY) {
    return withHeaders(
      json(
        { error: "No OpenAI API key is configured for this deployment." },
        { status: 503 }
      ),
      cors
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withHeaders(json({ error: "Invalid JSON body." }, { status: 400 }), cors);
  }

  const config = {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    effort: env.OPENAI_REASONING_EFFORT || DEFAULT_EFFORT,
  };

  if (pathname === "/api/model/chat") {
    const chat = parseChatRequest(body);
    if (typeof chat === "string") {
      return withHeaders(json({ error: chat }, { status: 400 }), cors);
    }
    try {
      return withHeaders(json(await chatWithModel(chat, config)), cors);
    } catch (error) {
      console.error("[model:chat]", error);
      return withHeaders(
        json(
          { error: error instanceof Error ? error.message : "Chat failed." },
          { status: 502 }
        ),
        cors
      );
    }
  }

  const parsed = parseGenerateRequest(body);
  if (typeof parsed === "string") {
    return withHeaders(json({ error: parsed }, { status: 400 }), cors);
  }

  try {
    const result = await generateWithModel(parsed, config);
    return withHeaders(json(result), cors);
  } catch (error) {
    console.error("[model]", error);
    return withHeaders(
      json(
        { error: error instanceof Error ? error.message : "Generation failed." },
        { status: 502 }
      ),
      cors
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      return handleMcp(request, env);
    }

    if (url.pathname.startsWith("/api/mcp/")) {
      return handleApi(request, env, url.pathname);
    }

    if (url.pathname.startsWith("/api/model/")) {
      return handleModel(request, env, url.pathname);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;
    if (!(request.headers.get("accept") || "").includes("text/html")) {
      return response;
    }
    url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
