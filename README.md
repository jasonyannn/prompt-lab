# Prompt Lab

**Live: https://jasonyannn.github.io/prompt-lab/**
(open in ChatGPT's in-app browser, or Chrome 149+ with WebMCP enabled)

A prompt library that exposes its real functionality to AI agents through two
standards-based surfaces:

- **Browser WebMCP** through the native `document.modelContext` API.
- **Remote MCP** through a public Streamable HTTP endpoint at `/mcp`.

Everything a human can do in this UI, an agent can do through a registered tool,
and browser-native, remote and local-agent calls appear in the Activity feed.

## Connect an external agent

Use the deployed app's MCP URL:

```text
https://<your-prompt-lab-site>/mcp
```

The endpoint implements the current stateless MCP `2026-07-28` protocol and a
stateless `2025-11-25` compatibility path. It returns JSON for ordinary modern
calls and uses the official `@modelcontextprotocol/server` Web Standard handler.

The remote library is stored in Cloudflare D1, so external agents can search,
create, render, rate, version, compare and delete prompts without keeping a
browser tab open. Prompt updates append to version history rather than silently
overwriting the only copy.

The hackathon deployment is intentionally an unauthenticated shared library.
Do not store secrets or private material there. Browser attachments and saved
agent knowledge remain device-local and are not exposed by the remote server.

### Remote tools

| Tool | Purpose |
|---|---|
| `search_products` | Search the public catalog plus shared remote prompts and agent templates |
| `list_agents` | List reusable remote agent profiles |
| `create_agent` / `update_agent` | Maintain remote agent profiles |
| `search_prompts` / `get_prompt` | Discover and read shared prompts |
| `create_prompt` / `update_prompt` | Create or revise prompts with history |
| `create_prompt_version` | Save an explicit new version |
| `create_prompt_variant` | Branch a prompt into the same family |
| `get_prompt_history` | Retrieve the full lifecycle of a prompt |
| `compare_prompt_versions` | Return a bounded line-by-line comparison |
| `rate_prompt` / `record_prompt_use` | Maintain quality and usage metadata |
| `render_prompt` | Fill `{{variables}}` and record a use |
| `delete_prompt` | Delete a prompt and its history after confirmation |

## WebMCP

Prompt Lab registers its tools directly against the browser's native model
context. The WebMCP Challenge's required catalog-search capability is
registered exactly as specified, from
[`src/lib/webmcp.ts`](src/lib/webmcp.ts):

```ts
document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords to match against a resource's name, description, category, tags and prompt text." },
      category: { type: "string", description: 'Restrict results to one category, e.g. "Career", "Travel" or "Prompt pack".' },
      limit: { type: "number", description: "Maximum results to return, 1–50. Defaults to 20." },
    },
  },
  execute: async (input) => {
    const result = searchProducts({
      query: input.query,
      category: input.category,
      limit: input.limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});
```

Every tool in `PROMPT_TOOLS` — `search_products` included — is handed to
`document.modelContext.registerTool()` by `registerPromptTools()`, so the call
above is the real registration path rather than an illustration.

### What "products" means here

Prompt Lab does not sell anything. There is no store, no checkout and no
inventory. For this generic catalog-search capability, **"product" means a
reusable Prompt Lab resource**:

| `type` | What it is | Source |
|---|---|---|
| `prompt` | A catalog prompt, or one saved in your library | `src/lib/catalogData.ts`, `promptStore` |
| `journey` | An ordered path of prompts from a goal to a result | `src/lib/catalogData.ts` |
| `prompt_pack` | A Prompt Studio workflow that generates a connected set | `src/lib/promptGenerator.ts` |
| `agent_template` | A reusable agent profile: role, instructions, category | `agentStore` |

The mapping lives only at the WebMCP boundary, in
[`src/lib/products.ts`](src/lib/products.ts). Nothing in the UI, the stores or
the database is renamed — a `Product` is derived on demand from real data and
is never persisted. `search_products` reuses the same resources the rest of the
app reads, so there is no parallel product database to drift out of sync.

**Request**

```json
{ "query": "cover letter", "category": "Career", "limit": 3 }
```

**Response**

```json
{
  "products": [
    {
      "id": "cr-cover",
      "name": "Cover letter",
      "description": "Short, specific, and clearly not a template.",
      "category": "Career",
      "type": "prompt"
    }
  ],
  "count": 1
}
```

Searches cover each resource's name, description, category, tags and — for
prompts — the prompt body itself. Results are ranked with name matches weighted
above body matches.

### Privacy

`search_products` only returns resources the current browser is entitled to
see. Anything carrying a non-public visibility flag is dropped by
`isPubliclyListable()` before it can reach a caller, and the filter is applied
twice: once when records are collected and again during the search. Private and
unlisted resources are never returned, including when a caller filters by the
category they belong to.

Calls are logged to the Activity panel as the tool name, the query, the result
count and success or error. Result contents are never logged.

## The browser WebMCP integration

Browser tools are registered against the browser's own model context. There is
no page-side shim or simulated model context — if the browser does not support
WebMCP, the app reports that honestly while the remote `/mcp` endpoint remains
available.

```ts
// src/lib/webmcp.ts
await document.modelContext.registerTool(tool, { signal: controller.signal });
```

`useWebMCP()` is called exactly once, from the root `App` component.

### Browser-registered tools

| Tool | Purpose |
|---|---|
| `list_attachments` | List source files attached in the active view |
| `read_attachment` | Return extracted document text or native image content |
| `list_agent_knowledge` | List reusable files saved to one or all agents |
| `read_agent_knowledge` | Read persistent document text or image content |
| `save_attachment_to_knowledge` | Save an active file to an agent for future sessions |
| `delete_agent_knowledge` | Remove a saved knowledge file |
| `list_agents` | List reusable agent profiles |
| `create_agent` | Create an expert role and working style |
| `update_agent` | Edit an agent profile |
| `generate_prompt_pack` | Turn a rough idea into four connected prompts |
| `predict_prompts` | Suggest ranked follow-up prompts for a topic |
| `list_categories` | List saved prompt categories |
| `create_category` | Create a reusable category |
| `delete_agent` | Remove an agent while keeping its prompts |
| `search_catalog` | Search the public prompt catalog by a user goal and return matching journeys + prompts |
| `browse_catalog` | Browse catalog categories, subcategories and prompt lists with optional filtering |
| `get_catalog_prompt` | Read one catalog prompt in full, including rendered content and variable placeholders |
| `save_catalog_prompt` | Save a catalog prompt into the user's personal prompt library |
| `start_journey` | Open a catalog journey and save its ordered prompts to the library |
| `search_prompts` | Keyword search across title, body and category |
| `get_prompt` | Fetch one prompt in full |
| `evaluate_prompt` | Score and test prompt structure and sample-output coverage |
| `create_prompt` | Save a new reusable prompt |
| `update_prompt` | Edit title / content / category |
| `rate_prompt` | Score a prompt 1–5 after use |
| `record_prompt_use` | Increment usage count when a prompt is actually used |
| `render_prompt` | Fill a prompt's `{{placeholders}}` and return finished text |
| `delete_prompt` | Remove a prompt (marked `destructiveHint`) |
| `search_forum_posts` | Search the public forum by keyword, category and topic |
| `list_forum_categories` | List forum categories with counts |
| `get_forum_post` | Read one published forum post in full |
| `list_forum_threads` | Group recent posts by category/thread |
| `publish_forum_post` | Publish a new forum prompt or brief |
| `draft_forum_post` | Save a forum draft without publishing it |
| `save_forum_post_to_library` | Copy a forum post into the user's local library |
| `generate_forum_summary` | Summarize a forum post and suggest tags |
| `like_forum_post` / `unlike_forum_post` | Toggle a signed-in user's like state |
| `get_forum_post_engagement` | Fetch like count and current user stance for a post |
| `get_trending_forum_posts` | Rank the most popular forum posts |
| `find_similar_posts` | Recommend similar prompt posts |
| `suggest_prompt_improvements` | Offer prompt-quality suggestions for a forum entry |
| `recommend_prompt_for_goal` | Recommend posts that match a goal or use case |
| `flag_forum_post` / `report_forum_post` | Flag a post for human review |
| `hide_forum_post` | Remove a post from public browsing while preserving moderation context |
| `get_moderation_queue` | List posts that need review |

The browser-side catalog tools let an agent discover public prompt journeys, inspect a specific catalog prompt, and bring it into the user's local library without leaving the page. The forum tools turn the same browser environment into a discoverable prompt-sharing surface: the agent can search publicly published posts, save the best ones to the user's library, suggest improvements, and participate in moderation and engagement flow. Read-only tools carry `annotations.readOnlyHint`. Every tool has a full JSON Schema `inputSchema`, and failures return `isError: true` with a readable message rather than throwing.

#### Catalog discovery and import tools

These five browser tools are the “library discovery” layer for the public prompt catalog:

- `search_catalog` — takes a natural-language goal like “I want to launch an online store” and returns the most relevant catalog journeys and individual prompts. It prioritizes journeys first, then prompts, so the agent can suggest the best starting path.
- `browse_catalog` — lists the catalog categories, lets an agent drill into a specific category or subcategory, and optionally filters by prompt tier (`quick`, `workflow`, `master`). This is the browse mode for exploration without a query.
- `get_catalog_prompt` — fetches one catalog prompt in full, including rendered content and the `{{variables}}` it expects. This is the read-detail step before saving or adapting a prompt.
- `save_catalog_prompt` — copies an existing catalog prompt into the user's personal library so it can be edited, rendered, rated, and reused locally. This keeps the public catalog as a template source rather than mutating the original.
- `start_journey` — opens a full journey (an ordered path of prompts for a goal) and optionally saves each step into the user's library. This is useful when the agent wants to hand the user a guided sequence rather than a single prompt.

#### Forum discovery and sharing tools

These tools extend Prompt Lab beyond the private library and into a public prompt-sharing loop:

- `search_forum_posts` — find useful public prompt posts by keyword or category.
- `get_forum_post` — read one full post, including content and like count.
- `list_forum_threads` — group recent prompt discussions by category.
- `publish_forum_post` — let an external agent publish a new prompt to the public forum.
- `save_forum_post_to_library` — copy a public post into the user's personal library,
  where it can be edited and reused locally.
- `generate_forum_summary` — produce a high-level summary + tags for a post.
- `like_forum_post` / `unlike_forum_post` — toggle social engagement when the current user is signed in.
- `get_trending_forum_posts` — surface the currently most active posts.
- `find_similar_posts` — recommend posts with similar structure or domain intent.
- `recommend_prompt_for_goal` — turn a natural-language goal into an actionable recommendation.
- `flag_forum_post` / `report_forum_post` — enable review workflows for low-quality or unsafe posts.
- `hide_forum_post` / `get_moderation_queue` — support a moderator path for content review.

### Live UI refresh

`promptStore` dispatches `promptlab:prompts-updated` on every mutation. The
`usePrompts` hook subscribes to it, so a tool call from an agent re-renders the
list and the open detail pane with no user interaction.

### Agent Activity

Browser and local tool calls are appended to an in-memory log. Remote calls are
stored durably and polled into the same Agent Activity panel, so the interface
labels all three sources.

## Forum and user system

Prompt Lab combines a local-first prompt library with a public forum backed by
Supabase. The personal library remains browser-local and stores prompts in
`localStorage`, while the forum persists public prompt posts and discussion data
in the database.

Users can sign in with email magic links, and signed-in authors appear in the
forum using their authenticated profile name. If a user is not signed in, they
can still publish an anonymous post; the UI then renders the post without a user
identity instead of requiring an account.

The forum stores author identity as `author_id`, and resolves the visible display
name by joining to `public.profiles` through the user record. This keeps the
author relationship stable without copying a user label into the post row.

Likes are handled in two layers:

- `forum_post_likes` records the per-user action for each post
- `forum_post_like_totals` stores the computed aggregate count used by the UI

This avoids writing the total count back onto the protected `forum_posts` row,
while still giving the app a fast and reliable count for the like button.

## Features

- **Document and image attachments** — drag in PDF, DOCX, text-based files, or
  common image formats. Documents are extracted locally and images are available
  to WebMCP agents and vision-capable local models.
- **Screenshot workflow** — turn an attached interface image into a visual
  inventory, UX/accessibility audit, reconstruction brief, and redesign directions.
- **Agent knowledge** — save files to an agent in browser IndexedDB and reuse them
  in later sessions without reattaching them.
- **Prompt testing** — score clarity, specificity, safety, completeness, and output
  consistency; fill test variables and optionally check a pasted sample response.
- **Prompt variables** — write `{{product}}` in a prompt; both the UI and the
  `render_prompt` tool fill them in, with a live preview as you type.
- **Prompt Studio** — choose a workflow, describe a rough idea, add any useful
  audience / platform / source-data context, then generate an editable four-prompt pack.
- **Custom agents** — create expert profiles with a role, working style and
  default category. Generated packs and local chat both use the selected profile.
- **Agent collections** — save prompts to an agent, filter the library by agent,
  or reassign prompts while editing.
- **Filter, sort and search** — category chips, sort by recent / most used /
  highest rated / title.
- **Duplicate and delete**, with a confirm step on delete.
- **Export / import** the whole library as JSON.
- **Built-in local agent** — chat with Llama 3.2 through Ollama, wired to the
  same tools (see below).
- **Agent Activity feed** — calls are labelled `WEBMCP`, `REMOTE MCP` or `LOCAL`.

## The built-in local agent (optional)

The bundled Ollama panel is a local demo so the browser tool loop can be shown
without a WebMCP-enabled browser. It calls the exact same page tool
implementations through `executeTool()`.

```bash
OLLAMA_ORIGINS=* ollama serve   # CORS: the browser calls Ollama directly
ollama pull llama3.2
```

For image interpretation, select a vision-capable Ollama model (for example,
`llama3.2-vision`). Text-only models can still use extracted document content.

Then open the **Local Agent** tab. The host and model are configurable and
stored in `localStorage`.

This panel is deliberately optional and fails soft: with no Ollama reachable it
shows an offline notice, and WebMCP tools stay registered regardless. Note that
a page served over HTTPS cannot reach `http://localhost:11434` (mixed content),
so the local agent is a localhost-only convenience — which is why the WebMCP
tools, not the local model, are the actual product.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle to dist/
npm run typecheck
```

Browser WebMCP requires a **secure origin**: localhost, or HTTPS in production.
The remote endpoint is emitted in the Sites build with a D1 binding and the
generated Drizzle migration under `drizzle/`.

## Architecture

```
src/
  lib/promptStore.ts     localStorage-backed prompt CRUD + change events
  lib/agentStore.ts      persistent custom agent profiles
  lib/promptGenerator.ts guided brief → reusable prompt-pack generator
  lib/attachments.ts     local file validation, extraction and WebMCP scope
  lib/knowledgeStore.ts  IndexedDB-backed, agent-specific reusable files
  lib/promptEvaluator.ts deterministic prompt rubric and sample-output test
  lib/webmcp.ts          WebMCP types, tool definitions, registration, activity log
  hooks/useWebMCP.ts     registers the tool set once, exposes status + activity
  hooks/useRemoteMCP.ts  detects /mcp and merges remote activity into the UI
  hooks/usePrompts.ts    live view of the library
  components/            status badge, activity panel, list, detail, new-prompt form
  App.tsx                root; calls useWebMCP()
server/
  index.ts               Cloudflare Worker routing, CORS and /mcp mount
  mcp.ts                 remote MCP server and 16 tool definitions
  database.ts            D1 persistence, seeds, versions and activity
db/schema.ts             Drizzle source schema
drizzle/                 generated D1 migration
```

## Status

The remote endpoint has been exercised at the protocol level for tool discovery,
search, create, version, history, compare and render calls against a SQLite-backed
D1-compatible test adapter. Both the stateless `2026-07-28` JSON path and the
`2025-11-25` initialization compatibility response are covered.

Prompts persist to `localStorage`, while reusable agent knowledge stays in local
browser IndexedDB. The remote shared prompt library and remote activity log use
D1. There is no upload backend, so attachments are never published through MCP.

The Ollama chat loop's tool-call round-tripping has not been exercised against a
live model on the development machine; the offline path and the shared tool
executor are covered.

## License

Copyright © 2026 Jason Yan and Makito Mizushima.

The source code is licensed under the MIT License — see [LICENSE](LICENSE).
Ownership and trademark details are in [NOTICE.md](NOTICE.md).
