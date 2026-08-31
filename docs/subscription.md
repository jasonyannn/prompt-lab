# Subscription

A commercial model for Prompt Lab. This is a design document — **none of it is
implemented**. There is no billing, no accounts and no metering in the codebase
today.

---

## What actually costs money

Everything else is static hosting. The cost driver is model inference, and it is
worth being precise because it decides the pricing.

Measured against `gpt-5.2` during development:

| Action | Output tokens | Wall time |
|---|---|---|
| Prompt pack (4 prompts) | ~1,400 | ~28s |
| Predicted batch (4) | ~1,400 | ~28s |
| Predicted batch (12) | ~4,000 | ~70s |
| Agent turn with one tool call | ~300–800 | ~20–40s |

A heavy session — a pack, two prediction batches and a dozen agent turns — is
roughly 15–20k output tokens. That is the unit to price against.

Three things are **free forever** because they cost nothing to serve:

- The whole catalog: 80 prompts, 9 journeys, 18 role variants.
- The deterministic generators — Studio packs and predictive prompts run
  entirely in the browser with no API call.
- The personal library in `localStorage`, and both MCP surfaces.

This is a genuinely unusual position: the product is fully useful with zero
inference cost. Paid tiers sell *convenience and scale*, not access.

---

## Tiers

### Free — £0

- Full catalog, journeys and variants
- Unlimited local prompts, categories and saved conversations
- Deterministic Studio and predictive generation
- Browser WebMCP tools
- Export and import
- **Bring your own OpenAI key** for the hosted agent and model generation

The BYO-key path matters. It keeps the flagship features reachable at zero cost
to us, and it converts developers, who are the people most likely to connect the
MCP endpoint.

### Pro — £8/month

- Everything in Free
- **Hosted model generation** — a monthly allowance, no key required
- **Cloud library** with an account, synced across devices
- **Version history and variants in the app** (today this exists only on the
  remote MCP surface)
- **Real prompt testing** — run a prompt, see the output, save the good one
- Private remote MCP endpoint with a personal token

Allowance rather than unlimited: something like 300 generations a month, which
covers ordinary use several times over while capping our exposure. Show the
counter honestly in the UI.

### Team — £16/user/month

- Everything in Pro
- **Shared team library** with roles (owner, editor, viewer)
- Team catalog: internal prompts alongside the public ones
- Usage and quality analytics — what gets used, what is stale, what is
  underperforming
- Shared MCP endpoint scoped to the team
- SSO, audit log

Teams are where prompt libraries genuinely matter. A company standardising how
its people brief AI is a real budget line; an individual saving prompts is a
nice-to-have.

### Enterprise — contact

Self-hosting, custom retention, DPA, SCIM, private catalog curation.

---

## Why this shape

**The free tier is not crippled.** Discovery is the product's differentiator and
it costs nothing to serve, so gating it would be self-defeating. People should
be able to get real value indefinitely without paying — and the ones who then
want an account and hosted generation are the ones who already trust it.

**Pro sells storage and continuity, not intelligence.** The upgrade trigger is
losing your library when you clear your browser, or wanting it on your phone.
That is a felt pain, unlike "more tokens".

**Team sells governance.** Once more than one person is involved, the questions
become "which prompt is canonical", "who changed it", "what is everyone using" —
all of which need accounts and history.

---

## Prerequisites, in order

Nothing here can ship without the first item.

1. **Accounts.** The Sites plugin already provides Sign in with ChatGPT,
   including a simulated local user for development. That is the cheapest
   identity to adopt, and it fits a product living inside the ChatGPT ecosystem.
2. **Per-user data.** The D1 schema has no user scoping — the remote library is
   one shared space. Every table needs an owner column and every query a filter.
   Doing this before there is real data in production is dramatically cheaper.
3. **Metering.** Count generations per user per period, server-side in the
   worker, at `/api/model/*`. This is also the abuse control described in
   `security.md`, so it earns its keep twice.
4. **Billing.** Stripe Checkout for subscribe, the customer portal for
   self-service management, and webhooks to reconcile entitlement. Entitlement
   should be a field the worker reads on each metered call — never trusted from
   the client.
5. **Sync.** Local ↔ cloud library reconciliation, with a clear conflict rule.
   Last-write-wins on a per-prompt basis is adequate given versions are kept.

---

## Metrics that would tell us it works

- **Activation:** saved a first prompt within one session.
- **Habit:** returns and uses a saved prompt in week two.
- **Library depth:** prompts saved per active user — the retention proxy.
- **Discovery share:** proportion of saved prompts that came from the catalog
  versus written from scratch. Validates the core thesis.
- **Journey completion:** started versus finished. Currently unmeasurable
  because journeys do not track progress.
- **Cost per active user:** inference spend ÷ active users, watched against the
  Pro price.

---

## Risks

- **Model cost outruns price.** Mitigated by the allowance, by the deterministic
  engines absorbing casual use, and by BYO-key on Free.
- **"Why pay for prompts?"** The answer must be continuity and teams, not
  content — the catalog is free and copyable by design.
- **Platform dependency.** Sitting inside the ChatGPT ecosystem is the
  distribution advantage and the concentration risk simultaneously.
- **The library is portable by design.** Export is a feature, so the product has
  to be worth staying for. That is the right constraint to hold.
