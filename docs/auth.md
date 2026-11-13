# Authentication

Accounts exist only for the community forum. The prompt library, agents and
MCP tools work with no account, and the app stays fully usable without
Supabase configured at all.

## Moving parts

| Piece | Where |
|---|---|
| Supabase client (anon key only) | `src/lib/supabase.ts` |
| Sign in / up, reset, sign out | `src/lib/forum.ts` |
| One shared auth state | `src/hooks/useAuth.ts` |
| Sign-in UI | `src/components/Landing.tsx` |
| Username, avatar | `UsernameSettings.tsx`, `profilePhoto.ts` |
| Profiles, RLS | `supabase/migrations/` |

Configuration is `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
`.env.local` and the GitHub repository **variables**. Both are public by
design; row-level security is the security boundary. Never put a service-role
key in a `VITE_` variable.

## Flows

**Sign up** needs email, password and a username. The handle is checked for
availability first, then sent as `promptlab_username` in the user metadata. A
database trigger (`forum_signup_username`) turns that into a `forum_profiles`
row, so the profile exists even when email confirmation returns no session.

**Sign in** is email and password. Signed-out is a normal state, not an error:
Supabase reports it as `AuthSessionMissingError`, which `getSessionUser`
translates to `null`.

**Password reset** emails a link; arriving from it fires `PASSWORD_RECOVERY`,
which `useAuth` exposes as `recovering` so the UI can ask for a new password.

## Dashboard settings the code depends on

These live in the Supabase dashboard (Authentication), not in the repo:

1. **URL Configuration → Site URL** — the deployed site. A confirmation or
   reset link with no valid redirect falls back to this.
2. **URL Configuration → Redirect URLs** — must include every origin that
   signs people in: the production URL, the GitHub Pages URL
   (`https://<user>.github.io/prompt-lab/`) and `http://localhost:5173/`.
   Sign-up and reset both pass `emailRedirectTo` / `redirectTo`; a URL that is
   not listed is silently replaced by the Site URL.
3. **Providers → Email** — decides whether new accounts must confirm their
   email before they can sign in.

## Common failures

| Symptom | Cause |
|---|---|
| `Failed to fetch` on sign-in | The project is paused (free tier, ~7 days idle) or `VITE_SUPABASE_URL` is wrong. The app reports this as "Couldn't reach the Supabase auth server". |
| Confirmation or reset link opens the wrong site | Redirect URL not listed, so Supabase used the Site URL. |
| `Invalid login credentials` right after sign-up | Email confirmation is on and the link has not been clicked. |
| Auth works locally, not on Pages | The GitHub repo **variables** are missing; the build then falls back to a placeholder URL. |
| Username "already taken" for a new account | Handles are unique across `forum_profiles`; the sign-up check fails closed. |
| Relation `forum_profiles` does not exist | The migrations were run in a different Supabase project. |

## Shared Supabase projects

Several apps can share one Supabase project, because `auth.users` is shared.
Everything here is namespaced `forum_*`, and the only hook on `auth.users`
acts on sign-ups that carry `promptlab_username`. Even so, keep Prompt Lab in
its own project when you can: a Site URL or email template changed for one app
changes it for all of them.
