# Agents

Prompt Lab has four distinct things called "agent". Keeping them separate
matters, because they live in different places and fail in different ways.

| Kind | What it is | Where it lives |
|---|---|---|
| **Agent profile** | A reusable expert persona: role, working style, default category | `src/lib/agentStore.ts`, D1 `agents` table |
| **In-app agent** | The chat assistant that drives the library through tools | `src/lib/chatgpt.ts`, `src/lib/ollama.ts` |
| **External agent** | Someone else's agent connecting over WebMCP or remote MCP | `src/lib/webmcp.ts`, `server/mcp.ts` |
| **Repo agent** | A coding agent that works on this codebase | `.github/agents/*.agent.md` |

---

## 1. Agent profiles

A profile shapes what gets generated. It carries a `role` ("Senior product and
interaction designer"), `instructions` (how to reason and prioritise) and a
`defaultCategory`.

**Shipping today:** Product Builder, Design Partner.

**The gap:** the catalog covers ten domains — e-commerce, software, business,
career, finance, learning, writing, productivity, health, relationships — but
only two of them have a matching agent profile. Someone browsing the Career
journey has no career-shaped agent to generate with.

### Profiles worth adding

Each is a few lines of data in `starterAgents`, and each maps to a catalog
category that already exists:

| Profile | Role | Default category |
|---|---|---|
| **Career Coach** | A recruiter who screens hundreds of applications a week | Career |
| **Money Coach** | A financial coach who never moralises about spending | Finance |
| **Growth Marketer** | A performance marketer who has wasted budget and learned | Marketing |
| **Security Reviewer** | An application security engineer who threat-models before reviewing code | Security |
| **Learning Coach** | A tutor who probes understanding rather than reassuring | Education |
| **Store Operator** | An e-commerce operator who has launched in crowded markets | E-commerce |
| **Editor** | A line editor who cuts without flattening the voice | Writing |
| **Ops Partner** | An operations manager who documents processes people follow | Productivity |

The role lines above are deliberately in the same voice as the catalog's
variant roles in `catalogData.ts`, so generated output stays consistent with
the browsable content.

---

## 2. The in-app agent

One conversation loop, two model providers:

- **Hosted (`gpt-5.2`)** — the default, and the only one that works on the
  deployed site. The API key stays server-side in the worker (`server/openai.ts`);
  the browser only ever talks to `/api/model/chat`.
- **Local (Ollama)** — for development. A deployed HTTPS page cannot reach
  `http://localhost:11434`, so this is a testing path, not a user feature.

**The tool loop stays in the browser.** Prompt Lab's tools act on the user's own
library in `localStorage` and IndexedDB, so the server cannot run them. The
worker is a stateless pass-through that holds the key and forwards the
conversation. This is the single most important architectural fact about the
agent — see `design.md`.

### Proposal, not autosave

`create_prompt` from the in-app chat is **intercepted** rather than executed.
Proposed prompts stage into a review tray where the user ticks what to keep and
picks the category. The agent is told plainly that it is proposing, not saving,
so it does not claim otherwise.

The intercept is opt-in per call site (`ToolIntercept` in `ollama.ts`), so
external agents calling the same tool are unaffected.

### System agents worth adding

These are capabilities, not chat personas. Each has a clear trigger and a
concrete output.

**Librarian** — runs over the library and proposes merges, retags and
deduplication. Value grows with library size; at 200 prompts a person cannot
police their own collection. Needs: `search_prompts`, `update_prompt`, a merge tool.

**Improver** — takes a prompt with a low rating or a poor `evaluate_prompt`
score and proposes a v2. This is the missing half of the quality loop: today the
app measures prompt quality and does nothing with the measurement. The remote
side already has `create_prompt_version`, so the storage exists.

**Prompt tester** — actually runs a prompt against gpt-5.2 with sample inputs
and shows the output. `Test · N` today is a static heuristic
(`promptEvaluator.ts`), not an execution. The `/api/model/generate` plumbing
already exists; this is mostly UI.

**Journey coach** — walks a saved journey step by step, holds context between
steps, and marks progress. Journeys currently save twelve prompts and then
abandon the user.

**Onboarding agent** — three questions on first run, then seeds a starter
library from the catalog. New users currently land on Discover with no guidance.

---

## 3. External agents

Two surfaces, deliberately different.

### Browser WebMCP — 28 tools

Registered on `document.modelContext`. Operates on the **device-local** library:
`localStorage` prompts, IndexedDB knowledge files, and the active attachments in
the page. Nothing leaves the browser.

Covers the full catalog surface too — `search_catalog`, `browse_catalog`,
`get_catalog_prompt`, `save_catalog_prompt`, `start_journey` — so an agent can
answer "what should I ask about starting a store?" without the user browsing.

### Remote MCP — 15 tools

Streamable HTTP at `/mcp`, backed by Cloudflare D1. Works with no browser tab
open. Supports the full prompt lifecycle including **version history, variants
and diffs**, which the local library does not.

Connecting: point any MCP client that supports remote servers at
`https://<site>/mcp`. VS Code, Claude and Codex all do. Jira is the exception —
Atlassian consumes MCP through Rovo rather than an arbitrary URL, so that
integration needs verifying rather than assuming.

**Current limitation:** unauthenticated and shared. Every connected client sees
one library and can delete from it. Fine for a hackathon demo, unacceptable for
real users. See `security.md`.

---

## 4. Repo agents

Coding agents defined in `.github/agents/`, used while building Prompt Lab.

Existing: **Reviewer** (regression and risk analysis before merge),
**Summariser** (repository mapping, focused on changed code).

Worth adding:

- **Test Writer** — the project has no test suite at all. An agent that writes
  the first behavioural tests around `promptStore`, `catalog` rendering and the
  chat tool loop would pay for itself.
- **Accessibility Auditor** — the UI has grown fast: pickers, trays and
  disclosure panels added without a focus-management pass.
- **Release Notes** — commit history is the only changelog today.

---

## Feature gaps, ranked

Ordered by value against effort, from an engineering point of view.

1. **Local version history.** The single worst asymmetry in the app. Editing a
   prompt in the browser overwrites it silently, while the remote library keeps
   every version. The D1 schema is a working design to copy.
2. **Accounts.** Unlocks per-user remote libraries, teams, and billing. The
   Sites plugin already provides a Sign in with ChatGPT flow, including a
   simulated local user for development — the cheapest path in.
3. **Local ↔ remote sync.** Two libraries that never talk is confusing. Users
   cannot tell where a prompt lives.
4. **Real prompt testing.** Run it, show the output, save the good result.
5. **Journey progress.** Track completed steps; resume where you left off.
6. **Prompt improver loop.** Use the rating and score data already being
   collected.
7. **Sharing.** A read-only link to one prompt or a journey.
8. **Semantic catalog search.** Matching is keyword overlap today, so
   "I want to get fit" finds nothing that "fitness" would.
9. **User contributions to the catalog.** It is a static file; there is no path
   from a great personal prompt to the public library.
