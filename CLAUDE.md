@AGENTS.md

## Claude Code specifics

- Prefer the project subagents in `.claude/agents/` for their jobs:
  `code-reviewer` before a merge, `test-writer` for new behaviour,
  `security-auditor` for anything touching `server/`, auth, RLS or untrusted
  content, `mcp-contract-guardian` for any tool or schema change, and
  `search-quality` when changing ranking or synonyms in `src/lib/textSearch.ts`.
- The Supabase connector may be signed into a different account from the one
  that owns this project's Supabase org. Check `list_organizations` before
  assuming a project is missing.
- Never commit `.env.local`, and never move a secret into a `VITE_` variable.
- Commit only when asked, using `Jason - <Description> (<Type>)`.
