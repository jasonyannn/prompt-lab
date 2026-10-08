# Architecture

How Prompt Lab fits together: where data lives, how requests flow, and where
the trust boundaries are. Product intent is in `goal.md`, the agent model in
`agent.md`, and threats in `security.md`.

---

## The shape

```
                         ┌───────────────────── Browser ─────────────────────┐
  Person ── UI (React) ──┤  promptStore / agentStore / categoryStore          │
                         │  conversationStore            → localStorage       │
  Browser agent ─────────┤  knowledgeStore               → IndexedDB          │
  (document.modelContext)│  attachments (pdf.js, mammoth, parsed in-page)     │
                         │  catalog (static, bundled)                          │
                         │  webmcp.ts: ~50 tools over all of the above        │
                         │  chatgpt.ts / ollama.ts: in-app agent tool loop     │
                         └───────┬───────────────────────┬────────────────────┘
                                 │ /api/model/*           │ supabase-js (anon key)
                                 ▼                        ▼
  External agent ── /mcp/ ──► Cloudflare Worker      Supabase
                              server/index.ts        auth.users, profiles,
                              ├ mcp.ts  (17 tools,   forum_posts, likes
                              │  + MCP prompts)      (RLS enforced)
                              ├ openai.ts ──► OpenAI Responses API
                              └ database.ts ──► D1: prompts, versions,
                                                agents, activity, rate limits
```

There are three data stores. None of them sync, and each has its own idea of
identity:

| Store | Holds | Identity | Durability |
|---|---|---|---|
| Browser (`localStorage`, IndexedDB) | Personal library, agents, chats, knowledge files | The device | Until site data is cleared |
| Cloudflare D1 | The shared remote library, with version history | None — one shared space | Durable |
| Supabase | Forum posts, likes, profiles | Email/password account | Durable; **free tier pauses after ~7 days idle** |

## Two deployments

| | GitHub Pages | OpenAI Sites |
|---|---|---|
| Build | `npm run build` (base `/prompt-lab/`) | `npm run build:sites` (base `/`) |
| `/api/model/*` | Absent: deterministic generators only | Worker proxy to OpenAI |
| `/mcp/` | Absent | Remote MCP over D1 |
| Supabase config | Repo variables, injected at build | Same |

Everything must degrade gracefully on Pages. `modelClient.readModelResponse`
turns the HTML 404 from a static host into a readable message, and every model
caller has a deterministic fallback.

## Request flows

### In-app agent turn

1. `AgentChat` builds the history, plus attachment context from
   `attachmentContext()`. The character budget is shared fairly across
   documents.
2. `chatgpt.ts` POSTs `{instructions, input, tools}` to `/api/model/chat`.
3. The worker checks Origin, size and the per-IP hourly limit, then forwards to
   the Responses API with a 90 s timeout.
4. Tool calls come back to the **browser**, which runs them with
   `executeTool()` against local storage and loops. `create_prompt` is
   intercepted into the review tray.

The loop must stay in the browser: the worker cannot see the user's library.

### Remote MCP call

`/mcp/` → origin allowlist → `createMcpHandler` (stateless; `2026-07-28` plus
`2025-11-25` compatibility) → a fresh `McpServer` per request → `runTool` →
`database.ts` → D1. Every call is logged to `remote_activity`, capped at 100
rows, and polled into the UI's Activity feed by `useRemoteMCP`.

### Forum

The browser talks to Supabase directly with the anon key. Security comes
entirely from RLS in `supabase/migrations/`:

- anyone can read published `public`/`unlisted` posts, and authors can read
  their own;
- anonymous inserts are forced to `public` + `published` with no author;
- like totals are maintained by a trigger and are read-only to clients;
- a profile row is created by trigger on sign-up.

## Retrieval

Every search surface uses one ranker, `src/lib/textSearch.ts`:

```
query ─► tokenize (case/accents, stop words, stemming)
      ─► expand each term with its synonym group (weight 0.6)
      ─► per record: best field hit × field weight × IDF
                     (exact 1.0 · prefix 0.7 for 3+ chars · synonym 0.6)
      ─► × coverage²  (share of query terms answered)
      ─► drop hits below minRelativeScore × best
```

| Surface | Caller | Fields (weight) |
|---|---|---|
| Discover, `search_catalog` | `catalog.searchCatalog` | journey goal 2, name 1.5, outcome 1 · prompt title 2, tags 1.2, summary 1 |
| `search_products` (both surfaces) | `productSearch.searchProductRecords` | name 3, description 1.5, category 1, body 1 |
| `search_prompts` (browser) | `promptStore.search` | title 3, category 1.5, content 1 |
| `search_prompts` (remote) | `database.searchPrompts` | SQL `LIKE` prefilter on any word or synonym, then the same ranker |

The library UI filter in `Workspace.tsx` stays a simple substring AND-filter.
It updates on every keystroke, and the user's chosen sort order applies.

Why not embeddings: the catalog is about 150 records and the ranker runs in
both the browser and the worker with no dependencies or latency. Synonym groups
cover the vocabulary gap that keyword overlap used to miss ("get fit" →
fitness). Revisit embeddings if libraries grow into the thousands.

## Prompt structure

Stored prompts are plain text. `promptSpec.ts` parses them into role,
objective, context, guardrails, process and output, and renders them back.
This is a lens, not a second stored field. It powers evaluation
(`promptEvaluator.ts`), section-level diffs, and export targets (`.prompt.md`,
Cursor rule, Claude skill, JSON spec, MCP prompt).

## Limits and budgets

| Limit | Value | Where |
|---|---|---|
| Model calls per IP per hour | 60 (`MODEL_RATE_LIMIT_PER_HOUR`) | `server/index.ts`, `model_rate_limits` table |
| Model request body | 8 MB | `server/index.ts` |
| Upstream timeout | generate 115 s · chat 90 s | `server/openai.ts` |
| Attachments | 5 files, 10 MB each, 24 MB total | `attachments.ts` |
| Attachment context | 60k chars for chat · 12k for Studio, shared fairly | `attachmentContext()` |
| Knowledge files | 12 per agent, 50 MB | `knowledgeStore.ts` |
| Saved conversations | 30, slimmed before writing | `conversationStore.ts` |
| Remote activity log | 100 rows, arguments truncated to 4 KB | `database.ts` |
