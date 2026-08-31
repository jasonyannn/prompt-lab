# Prompt Lab

**Live: https://jasonyannn.github.io/prompt-lab/**
(open in ChatGPT's in-app browser, or Chrome 149+ with WebMCP enabled)

A prompt library that exposes its real functionality to AI agents through
**WebMCP** — the browser's native `document.modelContext` API.

Everything a human can do in this UI, an agent can do through a registered tool,
and every agent action shows up in the interface immediately.

## The WebMCP integration

Tools are registered against the browser's own model context. There is no custom
MCP implementation, no shim, and no simulation — if the browser doesn't support
WebMCP, the app says so instead of pretending.

```ts
// src/lib/webmcp.ts
await document.modelContext.registerTool(tool, { signal: controller.signal });
```

`useWebMCP()` is called exactly once, from the root `App` component.

### Registered tools

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
| `delete_agent` | Remove an agent while keeping its prompts |
| `search_prompts` | Keyword search across title, body and category |
| `get_prompt` | Fetch one prompt in full |
| `evaluate_prompt` | Score and test prompt structure and sample-output coverage |
| `create_prompt` | Save a new reusable prompt |
| `update_prompt` | Edit title / content / category |
| `rate_prompt` | Score a prompt 1–5 after use |
| `record_prompt_use` | Increment usage count when a prompt is actually used |
| `render_prompt` | Fill a prompt's `{{placeholders}}` and return finished text |
| `delete_prompt` | Remove a prompt (marked `destructiveHint`) |

Read-only tools carry `annotations.readOnlyHint`. Every tool has a full JSON
Schema `inputSchema`, and failures return `isError: true` with a readable message
rather than throwing.

### Live UI refresh

`promptStore` dispatches `promptlab:prompts-updated` on every mutation. The
`usePrompts` hook subscribes to it, so a tool call from an agent re-renders the
list and the open detail pane with no user interaction.

### Agent Activity

Every tool call — successful or failed — is appended to an in-memory log and
rendered in the Agent Activity panel, so you can watch an agent work in real
time.

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
- **Agent Activity feed** — every tool call, labelled by whether it came from
  the browser's agent (`WEBMCP`) or the local model (`LOCAL`).

## The built-in local agent (optional)

The competition surface is `document.modelContext` — judges drive it with their
own agent. The bundled Ollama panel is a *local demo* so the tool loop can be
shown without a WebMCP-enabled browser. It calls the exact same tool
implementations, through `executeTool()`.

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

WebMCP requires a **secure origin**: localhost, or HTTPS in production.

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
  hooks/usePrompts.ts    live view of the library
  components/            status badge, activity panel, list, detail, new-prompt form
  App.tsx                root; calls useWebMCP()
```

## Status

Verified against a spec-accurate `document.modelContext` in a headless browser:
all tools register and survive React StrictMode's remount, agent mutations
refresh the UI live, error paths return `isError`, and the page loads with no
console errors.

Prompts persist to `localStorage`, while reusable agent knowledge stays in local
browser IndexedDB. There is no upload backend.

The Ollama chat loop's tool-call round-tripping has not been exercised against a
live model on the development machine; the offline path and the shared tool
executor are covered.

## License

Copyright © 2026 Jason Yan and Makito Mizushima.

The source code is licensed under the MIT License — see [LICENSE](LICENSE).
Ownership and trademark details are in [NOTICE.md](NOTICE.md).
