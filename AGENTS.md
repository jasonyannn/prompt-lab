# AGENTS.md

Guide for coding agents (Claude Code, Codex, Copilot) working on Prompt Lab.
Humans should start with [README.md](README.md); the system design is in
[docs/architecture.md](docs/architecture.md).

## What this is

A prompt library that exposes everything a person can do in its UI to AI
agents, through two MCP surfaces:

- **Browser WebMCP** — ~50 tools registered on `document.modelContext`
  (`src/lib/webmcp.ts`), operating on the device-local library.
- **Remote MCP** — Streamable HTTP at `/mcp/` (`server/mcp.ts`), backed by
  Cloudflare D1, operating on one shared library.

React 19 + Vite 8 + TypeScript, deployed two ways: a static GitHub Pages build
(no `/api`, no `/mcp`) and an OpenAI Sites build (Cloudflare Worker + D1, with
`/api/model/*` and `/mcp/`).

## Commands

```bash
npm run dev          # http://localhost:5173 — mirrors /api/model/* via vite.config.ts
npm test             # vitest, all suites (src/**/*.test.ts, server/**/*.test.ts)
npm run typecheck    # app only; the server has its own config:
npx tsc -p tsconfig.server.json --noEmit
npm run build        # tsc -b + vite build + esbuild worker bundle → dist/
```

Before you call work finished: `npm test`, both typechecks, and `npm run build`
must pass. The build is what CI runs (`.github/workflows/deploy.yml`).

## Where things live

| Area | Files |
|---|---|
| Local library (localStorage) | `src/lib/promptStore.ts`, `agentStore.ts`, `categoryStore.ts`, `conversationStore.ts` |
| Agent knowledge (IndexedDB) | `src/lib/knowledgeStore.ts` |
| Attachments (PDF/DOCX/images, parsed in-page) | `src/lib/attachments.ts` |
| Public catalog (static data) | `src/lib/catalogData.ts`, `catalog.ts` |
| **Search / retrieval** | `src/lib/textSearch.ts` — shared by every search surface |
| `search_products` boundary | `src/lib/products.ts`, `productSearch.ts`, `catalogProducts.ts` |
| Prompt structure lens | `src/lib/promptSpec.ts` (parse ↔ render; `content` stays the source of truth) |
| Deterministic generators | `src/lib/promptGenerator.ts`, `predictivePrompts.ts`, `promptEvaluator.ts` |
| In-app agent loop (browser) | `src/lib/chatgpt.ts` (hosted), `src/lib/ollama.ts` (local) |
| Browser tools | `src/lib/webmcp.ts` |
| Forum + auth (Supabase) | `src/lib/forum.ts`, `src/lib/supabase.ts`, `supabase/migrations/` |
| Worker routing, CORS, limits | `server/index.ts` |
| Remote MCP tools + prompts | `server/mcp.ts`, `src/lib/mcpPrompts.ts` |
| D1 persistence | `server/database.ts` (schema created at runtime by `ensureDatabase`) |
| OpenAI proxy | `server/openai.ts` |

## Invariants — do not break these

1. **The OpenAI key never reaches the browser.** Never read it through a
   `VITE_`-prefixed variable; Vite inlines those into the public bundle.
2. **The agent tool loop runs in the browser.** Tools act on `localStorage` and
   IndexedDB, which the worker cannot see. The worker is a stateless proxy.
3. **Nothing saves without consent.** In-app `create_prompt` is intercepted into
   a review tray (`ToolIntercept` in `ollama.ts`). External agents are not
   intercepted.
4. **Deterministic first, model second.** Every model call has a deterministic
   fallback. The app must stay fully usable with no API key and on GitHub Pages.
5. **Tool contracts are public API.** Changing a tool's name, `inputSchema` or
   result shape breaks external agents. `search_products` must keep the exact
   name and description `"Search the product catalog"` (tested).
6. **Untrusted content stays data.** Attachments, forum posts and stored prompts
   are user-authored. Delimit them and never let them become instructions.
7. **RLS is the forum's security boundary.** The browser talks to Supabase with
   the anon key. Any new table or column needs a policy in a migration under
   `supabase/migrations/` — never only in the dashboard.
8. **One retrieval model.** New search features go through
   `src/lib/textSearch.ts`, so the browser, the catalog and the worker rank the
   same way. Don't add another `includes()`-based search.

## Conventions

- Match the surrounding style: explanatory block comments on *why*, not *what*;
  no comment on self-evident lines.
- Tools return `isError: true` with a readable message instead of throwing.
  Read-only tools set `annotations.readOnlyHint`; destructive ones
  `destructiveHint`.
- Tests sit next to the code (`foo.ts` → `foo.test.ts`). D1 is stubbed with a
  small fake (`server/mcp.test.ts`, `server/rateLimit.test.ts`), not a live binding.
- Commit messages: `Jason - <Description> (<Type>)`, e.g.
  `Jason - Supabase Auth Recovery (Fix)`.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | `.env.local`, Sites settings | Server-side only |
| `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` | same | Optional overrides |
| `MODEL_RATE_LIMIT_PER_HOUR` | Sites settings | Model calls per IP per hour (default 60) |
| `PROMPTLAB_ALLOWED_ORIGINS` | Sites settings | Extra origins for `/mcp` and `/api/model` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local`, GitHub repo **variables** | Public by design; RLS protects data |

## Gotchas

- `/mcp/` needs the trailing slash on Sites; the edge 404s a bare `/mcp`.
- GitHub Pages builds use base `/prompt-lab/`; Sites builds use `/`.
- Free-tier Supabase projects pause after ~7 days idle, and the DNS name stops
  resolving — the browser reports this as `Failed to fetch`.
- `workflow-main/` is a vendored third-party docs template. Ignore it.

## Repo agents

Task-specific subagents live in `.claude/agents/` (Claude Code) and
`.github/agents/` (Copilot). See [docs/agent.md](docs/agent.md) §4.
