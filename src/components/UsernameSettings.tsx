import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { getCurrentProfile, updateUsername } from "../lib/forum";

export function UsernameSettings() {
  const { user, checking } = useAuth();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setUsername("");
    setError(null);
    setMessage(null);
    if (!user) {
      setLoading(false);
      return;
    }
    void getCurrentProfile().then((profile) => {
      if (active) setUsername(profile?.username ?? "");
    }).catch(() => {
      if (active) setError("Could not load your username. Reopen Settings to retry.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user?.id]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const profile = await updateUsername(username);
      setUsername(profile.username ?? "");
      setMessage("Username saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your username.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-panel" aria-labelledby="username-heading">
      <div className="panel-head"><h2 id="username-heading">Username</h2></div>
      <div className="panel-body">
        {checking || loading ? <p className="settings-note">Loading your account…</p> : !user ? (
          <p className="settings-note">Sign in to choose a username.</p>
        ) : (
          <form className="username-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <label htmlFor="settings-username">Your public handle</label>
            <p id="settings-username-help" className="settings-note">
              Choose a unique username with 3–24 letters, numbers, or underscores.
              You’ll still sign in with your email address.
            </p>
            <div className="username-controls">
              <input id="settings-username" className="input" autoComplete="username"
                required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}"
                placeholder="e.g. jason_yan" aria-describedby="settings-username-help"
                value={username} disabled={saving}
                onChange={(event) => { setUsername(event.target.value); setError(null); setMessage(null); }} />
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save username"}
              </button>
            </div>
            <div role="status" aria-live="polite">
              {message && <p className="account-feedback is-good">{message}</p>}
              {error && <p className="account-feedback is-bad">{error}</p>}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
