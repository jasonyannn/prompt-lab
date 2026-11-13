# MCP guide

Prompt Lab exposes everything a person can do in its UI to AI agents. It does
this over two MCP surfaces that share vocabulary but not storage. This page is
the practical guide; the system design is in [architecture.md](architecture.md)
and the risks are in [security.md](security.md).

| | Browser WebMCP | Remote MCP |
|---|---|---|
| Code | `src/lib/webmcp.ts` | `server/mcp.ts` |
| Transport | `document.modelContext` (in the page) | Streamable HTTP at `/mcp/` |
| Storage | This device (localStorage + IndexedDB) | One shared Cloudflare D1 library |
| Tools | 50 | 15 |
| Prompts | Registered from the local library | Registered from the shared library |
| Availability | Only while the page is open | Any MCP client, any time (OpenAI Sites build) |

The static GitHub Pages build has neither `/api` nor `/mcp`; there only the
in-page surface exists.

## Tools are public API

An external agent only knows a tool by its **name**, **description**,
**`inputSchema`** and **result shape**. Change any of those and agents that
worked yesterday break silently. So:

- `search_products` must keep the exact name and description
  `"Search the product catalog"`. This is tested.
- Add optional fields rather than renaming or removing required ones.
- Read-only tools set `annotations.readOnlyHint`; destructive ones set
  `destructiveHint`, and the agent is told to confirm first.
- Tools return `isError: true` with a readable message instead of throwing, so
  the agent can read the failure and recover.
- Anything stored by a user (prompts, attachments, forum posts) is data, never
  instructions. Tool results delimit it.

The `mcp-contract-guardian` agent in `.claude/agents/` reviews any change that
touches a tool, schema or MCP prompt.

## Tool groups

**Browser WebMCP (50)**

- Prompts: `search_prompts`, `get_prompt`, `create_prompt`, `update_prompt`,
  `delete_prompt`, `render_prompt`, `rate_prompt`, `record_prompt_use`,
  `export_prompt`, `evaluate_prompt`, `suggest_prompt_improvements`
- Discovery: `search_catalog`, `browse_catalog`, `get_catalog_prompt`,
  `save_catalog_prompt`, `search_products`, `recommend_prompt_for_goal`,
  `predict_prompts`, `generate_prompt_pack`, `start_journey`
- Agents and knowledge: `list_agents`, `create_agent`, `update_agent`,
  `delete_agent`, `get_agent_prompts`, `list_agent_knowledge`,
  `read_agent_knowledge`, `delete_agent_knowledge`
- Attachments: `list_attachments`, `read_attachment`,
  `save_attachment_to_knowledge`
- Forum: search, read, draft, publish, like/unlike, report, flag, hide,
  moderation queue, summaries, trending, save to library

**Remote MCP (15)** — `search_prompts`, `get_prompt`, `create_prompt`,
`create_prompt_variant`, `get_prompt_history`, `compare_prompt_versions`,
`rate_prompt`, `record_prompt_use`, `render_prompt`, `export_prompt`,
`delete_prompt`, `list_agents`, `create_agent`, `update_agent`,
`search_products`.

The remote set is smaller on purpose: it has no browser-only state (knowledge
base, attachments, forum session), and it adds version history because D1
keeps it.

## MCP prompts

Saved prompts are also registered as **MCP prompts**, so a client can offer
them as slash commands. Variables in a prompt become prompt arguments
(`src/lib/variables.ts`, `src/lib/mcpPrompts.ts`), and the client fills them
before the text reaches the model.

## Markdown and other export formats

`export_prompt` (and the UI's export) writes one prompt as a file an agent
runtime can load directly. It works because a prompt is parsed into a
structured spec (`src/lib/promptSpec.ts`), so the parts are addressable
rather than copied as text. `compilePrompt` in `src/lib/mcpPrompts.ts` emits:

| Target | File | Used by |
|---|---|---|
| `prompt-md` | `<slug>.prompt.md` | Plain Markdown prompt with front matter |
| `cursor-rule` | `<slug>.mdc` | Cursor rules |
| `claude-skill` | `<slug>/SKILL.md` | Claude skills |
| `json-spec` | `<slug>.json` | Structured spec for tooling |
| `mcp-prompt` | `<slug>.json` | An MCP prompt definition |
| `markdown` | `<slug>.md` | Plain Markdown |

`content` stays the source of truth; the spec is a lens over it and renders
back to the same text.

## Agent instruction files in this repo

The repository is itself set up for agents, with Markdown as the interface:

- `AGENTS.md` — the guide any coding agent reads first: invariants, commands,
  where things live. `CLAUDE.md` imports it and adds Claude Code specifics.
- `.claude/agents/*.md` — project subagents (code review, test writing,
  security audit, MCP contract guard, search quality), each with its own tools
  and scope.
- `.github/agents/*.agent.md` — the Copilot equivalents.
- `docs/*.md` — design notes agents are pointed at instead of re-deriving.

## Connecting a client

Remote MCP, from any Streamable-HTTP client:

```
https://<your-site>/mcp/
```

Use the trailing slash; the Sites edge returns 404 for a bare `/mcp`.
Cross-origin browser clients must be listed in `PROMPTLAB_ALLOWED_ORIGINS`.

The remote library is shared and unauthenticated — see
[security.md](security.md#finding-2--the-remote-mcp-library-is-a-shared-unauthenticated-space)
before pointing it at anything private.

## Testing

- `server/mcp.test.ts` exercises the remote tools against a small D1 fake.
- `src/lib/mcpPrompts.test.ts` covers prompt compilation and argument filling.
- `src/lib/products.test.ts` pins the `search_products` contract.
