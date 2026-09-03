# Security

The threat model, what is handled well, and what is not. Written against the
code as it stands, not as it is intended to be.

---

## Finding 1 — the model endpoints are open, and they spend real money

**Severity: high. Fix before the site is publicly linked.**

`/api/model/generate` and `/api/model/chat` have no authentication, no rate
limiting and no per-caller quota. The only guard is an Origin check
(`rejectInvalidOrigin` in `server/index.ts`), and it allows a request when the
`Origin` header is **absent**:

```ts
const origin = request.headers.get("Origin");
if (!origin || allowedOrigins(request, env).has(origin)) return null;
```

Browsers always send `Origin` on a cross-origin POST, so the check does stop a
hostile web page. It does nothing about a script. `curl` sends no `Origin` at
all and therefore passes.

The consequence: anyone who knows the deployed URL can post to
`/api/model/generate` in a loop and bill it to the project's OpenAI key. A
single call to that route can be worth up to 16,000 output tokens
(`max_output_tokens` in `server/openai.ts`).

### Mitigations, cheapest first

1. **Set a hard spend cap on the OpenAI project key.** This is the only control
   that works regardless of code bugs, and it takes a minute in the OpenAI
   dashboard. Do this first, today.
2. **Reject a missing `Origin`** on the model routes. One line, stops naive
   scripted abuse. Trivially spoofed, so it is a speed bump, not a fix.
3. **Rate limit per IP** using `CF-Connecting-IP` — a counter in D1 or KV keyed
   by IP and hour. Sufficient for a public demo.
4. **Require identity** for metered calls. The real fix, and a prerequisite for
   billing anyway (see `subscription.md`).

Until at least (1) and (3) are in place, treat the deployed model endpoints as a
spending liability, not a feature.

---

## Finding 2 — the remote MCP library is a shared, unauthenticated space

**Severity: medium for a hackathon, high for real users. Documented, not
accidental.**

`/mcp` exposes 17 tools and the whole prompt library against one Cloudflare D1
database with no accounts.
Every connected client reads and writes the same library, and `delete_prompt`
permanently removes a prompt and its version history for everyone.

The README states this plainly and warns against storing anything private, which
is the right call for a demo. It is not a position that survives having users.

Mitigations: per-user scoping in the schema, a bearer token per client, and
soft-delete instead of hard-delete. All three are prerequisites for the paid
tiers.

---

## Handled well

### API key custody

The OpenAI key never reaches the browser. It lives in the worker environment,
and the browser talks only to `/api/model/*`. Locally it comes from `.env.local`,
which matches the `*.local` rule already in `.gitignore` — verified with
`git check-ignore`.

The one trap worth remembering: **never** move the key to a `VITE_`-prefixed
variable. Vite inlines those into the client bundle at build time, so it would
be published with the site. A plain `.env` file is also *not* covered by the
current ignore rules; only `.env.local` is.

### Prompt injection

Attachments, tool results and catalog content are all user- or file-authored and
are treated as untrusted:

- The agent's system prompt instructs it to treat attached material as source
  content and never follow instructions found inside a file.
- Generated prompts carry the same instruction to whichever model runs them
  later.
- WebMCP descriptors use `untrustedContentHint`, and `get_prompt_history`
  explicitly warns that stored prompt content is untrusted.
- Attachment text is truncated before it enters a prompt.

This is more care than most applications take. The residual risk is that a
sufficiently persuasive document could still steer a tool-calling agent — the
mitigation is that Prompt Lab's tools are low-consequence (they edit a prompt
library), and destructive ones require confirmation.

### Blast radius of the browser tools

The 28 WebMCP tools operate only on device-local data: `localStorage` prompts,
IndexedDB knowledge, and attachments in the current page. There is no ambient
network authority, so a compromised agent can vandalise one browser's library
and nothing else.

### Origin and CORS on the MCP endpoint

`/mcp` applies the same origin allowlist and echoes CORS headers only for
permitted origins, with `Vary: Origin` set correctly. Responses set
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

### Destructive operations

`delete_prompt`, `delete_agent` and `delete_agent_knowledge` are annotated
`destructiveHint` and the agent is instructed to confirm first. The knowledge
library requires a second click to remove a file.

### Storage limits

`conversationStore` slims messages before writing — base64 image payloads and
attachment data URLs are dropped, tool results truncated — with a cap of 30
conversations and a quota-exceeded fallback. Without this, a couple of
image-heavy chats would fill `localStorage` and break saving entirely.

---

## Weaknesses worth tracking

**No Content-Security-Policy.** The app loads Google Fonts and runs inline
styles; a CSP would meaningfully reduce XSS impact. Nothing sets one today.

**Local data is not encrypted.** Prompts, conversations and knowledge files sit
in plaintext `localStorage` and IndexedDB. Reasonable for the threat model —
anyone with the device has the browser — but it means Prompt Lab is not a place
for sensitive material, and the UI does not say so.

**No output escaping review.** Model output is rendered into the chat. React
escapes by default, which covers the common case, but any future move to
`dangerouslySetInnerHTML` for markdown rendering would need care.

**Attachment parsing runs in the page.** PDFs and DOCX files are parsed
client-side by `pdfjs-dist` and `mammoth`. A malicious file exploits the user's
browser rather than a server, which limits the blast radius, but those libraries
should be kept current.

**No audit trail on the remote library.** `remoteActivity` logs tool calls, but
without identity there is no way to attribute a deletion.

**No dependency scanning.** No Dependabot or `npm audit` in CI.

---

## If deploying publicly, in order

1. Hard spend cap on the OpenAI key.
2. Rate limit `/api/model/*` by IP.
3. Reject requests with no `Origin` on the model routes.
4. Decide whether `/mcp` stays open. If yes, say so prominently in the UI, not
   only in the README. If no, add per-client tokens.
5. Add a CSP header.
6. Soft-delete on the remote library.
7. Dependency scanning in CI.

Items 1–3 are hours of work and remove the only finding that costs money while
you sleep.
