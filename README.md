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

The browser-side catalog tools let an agent discover public prompt journeys, inspect a specific catalog prompt, and bring it into the user's local library without leaving the page. Read-only tools carry `annotations.readOnlyHint`. Every tool has a full JSON Schema `inputSchema`, and failures return `isError: true` with a readable message rather than throwing.

#### Catalog discovery and import tools

These five browser tools are the “library discovery” layer for the public prompt catalog:

- `search_catalog` — takes a natural-language goal like “I want to launch an online store” and returns the most relevant catalog journeys and individual prompts. It prioritizes journeys first, then prompts, so the agent can suggest the best starting path.
- `browse_catalog` — lists the catalog categories, lets an agent drill into a specific category or subcategory, and optionally filters by prompt tier (`quick`, `workflow`, `master`). This is the browse mode for exploration without a query.
- `get_catalog_prompt` — fetches one catalog prompt in full, including rendered content and the `{{variables}}` it expects. This is the read-detail step before saving or adapting a prompt.
- `save_catalog_prompt` — copies an existing catalog prompt into the user's personal library so it can be edited, rendered, rated, and reused locally. This keeps the public catalog as a template source rather than mutating the original.
- `start_journey` — opens a full journey (an ordered path of prompts for a goal) and optionally saves each step into the user's library. This is useful when the agent wants to hand the user a guided sequence rather than a single prompt.

### Live UI refresh

`promptStore` dispatches `promptlab:prompts-updated` on every mutation. The
`usePrompts` hook subscribes to it, so a tool call from an agent re-renders the
list and the open detail pane with no user interaction.

### Agent Activity

Browser and local tool calls are appended to an in-memory log. Remote calls are
stored durably and polled into the same Agent Activity panel, so the interface
labels all three sources.

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
  mcp.ts                 remote MCP server and 15 tool definitions
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
