# Goal

## The problem

Most AI products open with an empty text box. To get value out of one, a person
already has to know what AI can help them with, which question to ask, what
context to supply, and how to structure the request. That is a prompt
engineering skill set, and most people do not have it.

Prompt Lab removes the starting-point problem. It answers the question that
comes *before* "how do I write this prompt?" — namely, "what could I even ask?"

> **Prompt Lab helps you discover what to ask AI, create the right prompt, and
> build a reusable library of what works.**

## The shift

| Today | With Prompt Lab |
|---|---|
| Have a problem | Have a goal |
| Open a chat, stare at the box | Open Discover, browse by goal |
| Guess at a prompt | Pick a journey or prompt that fits |
| Get a mediocre answer | Personalise it with your own context |
| Lose it in chat history | Save it, version it, reuse it |

## Who it is for

- **People with a goal and no vocabulary for it** — starting a store, changing
  jobs, learning something hard. They need to be shown the questions.
- **People who already use AI heavily** — they have good prompts scattered
  across chat histories and notes, and no home for them.
- **Agents** — increasingly the actual user. An agent that can search, render
  and save prompts on someone's behalf needs a library with a real API, not a
  UI it has to read pixels from.

## What exists today

| Capability | Where |
|---|---|
| Public catalog: 111 prompts, 13 categories, 45 subcategories | `src/lib/catalogData.ts` |
| 13 journeys — ordered paths from a goal to a result | `src/lib/catalogData.ts` |
| 18 role variants (resume, cover letter) and 14 content niches | `src/lib/catalog.ts` |
| Personal library: categories, `{{variables}}`, ratings, usage | `src/lib/promptStore.ts` |
| Prompt Studio: guided brief → connected prompt pack | `src/lib/promptGenerator.ts` |
| Predictive prompts: what you are likely to ask next | `src/lib/predictivePrompts.ts` |
| In-app agent: hosted gpt-5.2, or local Ollama for testing | `src/lib/chatgpt.ts`, `src/lib/ollama.ts` |
| Saved conversations, multiple chats | `src/lib/conversationStore.ts` |
| 28 browser tools over WebMCP | `src/lib/webmcp.ts` |
| 15 remote tools over MCP, backed by Cloudflare D1 | `server/mcp.ts` |
| Community forum: sign-in, posts and likes, on Supabase | `src/components/Forum.tsx` |
| Version history, variants and diffs — **remote only** | `db/schema.ts` |

## The four jobs

1. **Discover** — the public catalog and journeys show what is worth asking.
2. **Create** — the Studio and the agent turn a rough idea into structured prompts.
3. **Remember** — the personal library keeps what works, categorised and searchable.
4. **Evolve** — versions and variants let a prompt improve instead of being replaced.

Prompt discovery is the differentiator. A traditional prompt library helps you
*find the prompt you already knew you wanted*. Prompt Lab tells you what to
want.

## Principles

- **Show, don't ask.** Never present an empty box where a list of options would
  do. The Discover surface exists because of this.
- **Structure over prose.** Every prompt states a role, context, process and an
  exact output format. Prompts are specs, not wishes.
- **Instant by default, model when it helps.** The generators are deterministic
  and work offline with no API key. The model is an upgrade, never a dependency
  — see `design.md`.
- **The agent is a first-class user.** Anything a human can do here, an agent
  can do through a tool. That is the WebMCP thesis.
- **Nothing saves without consent.** The agent proposes; the person chooses what
  lands in their library and in which category.

## What "done" looks like

Near term (hackathon):

- A visitor with no AI experience reaches a useful, personalised prompt in under
  two minutes without typing a prompt themselves.
- An external agent connects to `/mcp` and completes a full lifecycle: search →
  read → render → rate → version.

Beyond:

- A person's library becomes the record of how they actually work with AI, and
  is worth paying to keep — see `subscription.md`.
- Prompts improve measurably over time, driven by rating and usage data rather
  than vibes.

## Known gaps

Honest list, expanded in `agent.md` and `design.md`:

- **Version history is remote-only.** Editing a prompt in the browser library
  silently overwrites it. The D1 schema already models versions; the local store
  does not.
- **Three data stores, no shared identity.** The browser library
  (`localStorage`), the remote MCP library (Cloudflare D1) and the forum
  (Supabase) each have their own notion of who you are, and none of them sync.
  Accounts would collapse this into one.
- **No accounts.** The remote library is a single shared unauthenticated space,
  which blocks per-user libraries, teams and billing.
- **`Test · N` does not run anything.** It is a static heuristic score, not a
  real execution against a model.
- **Journeys do not track progress.** You can save all twelve steps but nothing
  records which you have completed.
