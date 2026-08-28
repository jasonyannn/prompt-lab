# Prompt Lab

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
| `search_prompts` | Keyword search across title, body and category |
| `get_prompt` | Fetch one prompt in full |
| `create_prompt` | Save a new reusable prompt |
| `update_prompt` | Edit title / content / category |
| `rate_prompt` | Score a prompt 1–5 after use |
| `record_prompt_use` | Increment usage count when a prompt is actually used |

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
  lib/webmcp.ts          WebMCP types, tool definitions, registration, activity log
  hooks/useWebMCP.ts     registers the tool set once, exposes status + activity
  hooks/usePrompts.ts    live view of the library
  components/            status badge, activity panel, list, detail, new-prompt form
  App.tsx                root; calls useWebMCP()
```

## Status

Verified against a spec-accurate `document.modelContext` in a headless browser:
all six tools register and survive React StrictMode's remount, agent mutations
refresh the UI live, error paths return `isError`, and the page loads with no
console errors.

Prompts persist to `localStorage` only — there is no backend yet.
