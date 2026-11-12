import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { PROMPT_TOOLS } from "../lib/webmcp";
import type { WebMCPState } from "../hooks/useWebMCP";
import type { RemoteMCPState } from "../hooks/useRemoteMCP";

type Props = {
  webmcp: WebMCPState;
  remoteMcp: RemoteMCPState;
  onEnter: () => void;
};

const SNIPPET = `document.modelContext.registerTool({
  name: "create_prompt",
  description: "Save a new reusable prompt.",
  inputSchema: { type: "object", properties: { … } },
  async execute({ title, content }) {
    return { content: [{ type: "text", text: "Saved." }] };
  }
});`;

const STEPS = [
  {
    n: "01",
    title: "Connect from anywhere",
    body: "Give an external agent the /mcp/ URL. It discovers a typed Streamable HTTP tool surface without opening or clicking through the interface.",
  },
  {
    n: "02",
    title: "Work with a living library",
    body: "Agents can search, create, render, version and compare prompts in a durable shared library. Older versions are preserved instead of overwritten.",
  },
  {
    n: "03",
    title: "See who came in",
    body: "Remote calls are recorded in the Activity feed alongside browser-native WebMCP and the built-in local agent, so every path stays observable.",
  },
];

/** Reveals children on scroll. IntersectionObserver only — no library. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(node);

    /*
     * Failsafe: content must never be permanently stuck at opacity 0. If the
     * observer never fires — a headless capture, an unscrolled tab, a print to
     * PDF — show everything anyway. The animation is decoration, not a gate.
     */
    const failsafe = window.setTimeout(() => setShown(true), 2500);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return { ref, className: shown ? "reveal is-shown" : "reveal" };
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reveal = useReveal<HTMLDivElement>();
  return (
    <div ref={reveal.ref} className={`${reveal.className} ${className}`}>
      {children}
    </div>
  );
}

export function Landing({ webmcp, remoteMcp, onEnter }: Props) {
  const { user, checking, recovering, signIn, signUp, signOut, sendResetEmail, setNewPassword } = useAuth();
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  /** Scroll to the card *and* focus the field, so one click is enough. */
  function focusSignIn(mode: "signin" | "signup" | "forgot" = "signin") {
    setAuthMode(mode);
    setAuthState({ kind: "idle" });
    document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus once the smooth scroll settles, or it fights the animation.
    window.setTimeout(() => emailRef.current?.focus(), 420);
  }

  const [authState, setAuthState] = useState<
    { kind: "idle" | "sending" } | { kind: "sent" | "error"; text: string }
  >({ kind: "idle" });

  async function submitSignIn() {
    const address = email.trim();
    if (!address || !password.trim()) {
      setAuthState({ kind: "error", text: "Enter both your email and password." });
      return;
    }
    setAuthState({ kind: "sending" });
    try {
      await signIn(address, password);
      setAuthState({
        kind: "sent",
        text: `Signed in as ${address}.`,
      });
      setPassword("");
    } catch (caught) {
      setAuthState({
        kind: "error",
        text: caught instanceof Error ? caught.message : "Could not sign in.",
      });
    }
  }

  async function submitReset() {
    const address = email.trim();
    if (!address) {
      setAuthState({ kind: "error", text: "Enter your email address first." });
      return;
    }
    setAuthState({ kind: "sending" });
    try {
      await sendResetEmail(address);
      setAuthState({
        kind: "sent",
        text: `If ${address} has an account, a reset link is on its way. Check your inbox and spam.`,
      });
    } catch (caught) {
      setAuthState({
        kind: "error",
        text: caught instanceof Error ? caught.message : "Could not send the reset email.",
      });
    }
  }

  async function submitNewPassword() {
    if (!password.trim()) {
      setAuthState({ kind: "error", text: "Enter a new password." });
      return;
    }
    setAuthState({ kind: "sending" });
    try {
      await setNewPassword(password);
      setAuthState({ kind: "sent", text: "Password updated. You're signed in." });
      setPassword("");
    } catch (caught) {
      setAuthState({
        kind: "error",
        text: caught instanceof Error ? caught.message : "Could not update your password.",
      });
    }
  }

  async function submitSignUp() {
    const address = email.trim();
    if (!username.trim()) {
      setAuthState({ kind: "error", text: "Choose a username to create your account." });
      return;
    }
    if (!address || !password.trim()) {
      setAuthState({ kind: "error", text: "Enter both your email and password." });
      return;
    }
    setAuthState({ kind: "sending" });
    try {
      const result = await signUp(address, password, username);
      setAuthState({
        kind: "sent",
        text: result.session
          ? "Account created. You’re signed in."
          : `Check your email at ${address} to confirm your account, then sign in.`,
      });
      setPassword("");
    } catch (caught) {
      setAuthState({
        kind: "error",
        text: caught instanceof Error ? caught.message : "Could not create the account.",
      });
    }
  }

  const [openTool, setOpenTool] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked; the code is visible on screen regardless */
    }
  }

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(remoteMcp.endpoint);
      setCopiedEndpoint(true);
      window.setTimeout(() => setCopiedEndpoint(false), 1600);
    } catch {
      /* The endpoint remains visible and selectable when clipboard access is blocked. */
    }
  }

  const passwordField = (
        <div className="password-field">
          <input
              className="input"
              type={showPassword ? "text" : "password"}
              autoComplete={authMode === "signup" || recovering ? "new-password" : "current-password"}
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
          />
          <button
              className="password-toggle"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
  );

  return (
    <div className="landing">
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true" />
            <h1>Prompt Lab</h1>
          </div>

          <nav className="lp-links">
            <a href="#connect">Connect</a>
            <a href="#tools">Tools</a>
            <a href="#how">How it works</a>
            <a
              href="https://github.com/jasonyannn/prompt-lab"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>

          <div className="lp-nav-right">
            <span
              className={`status ${remoteMcp.ready || webmcp.ready ? "is-ready" : "is-off"}`}
              title={
                remoteMcp.ready
                  ? `${remoteMcp.tools.length} tools available at ${remoteMcp.endpoint}`
                  : webmcp.ready
                    ? `${webmcp.tools.length} tools registered on document.modelContext`
                    : "Checking the remote endpoint; browser WebMCP is unavailable"
              }
            >
              <span className="dot" />
              {remoteMcp.ready
                ? `Remote MCP Ready · ${remoteMcp.tools.length}`
                : remoteMcp.checking || webmcp.supported
                  ? "MCP connecting…"
                  : webmcp.ready
                    ? `WebMCP Ready · ${webmcp.tools.length}`
                    : "MCP endpoint offline"}
            </span>
            <button className="btn btn-quiet" onClick={() => focusSignIn()}>
              {user ? (user.email ?? "Account") : "Sign in"}
            </button>
            {!user && (
              <button className="btn btn-primary" onClick={() => focusSignIn("signup")}>
                Create account
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="lp-main">
        <div className="lp-intro">
        {/* Hero ------------------------------------------------------- */}
        <Section className="hero">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            WebMCP Challenge · 2026
          </span>

          <h2 className="display">
            A prompt library that
            <br />
            <em>agents can actually use.</em>
          </h2>

          <p className="lede">
            Most web apps make an agent read pixels and guess at buttons. Prompt
            Lab hands it typed tools instead — in the browser through native{" "}
            <code>document.modelContext</code>, and over the web through a real{" "}
            <code>/mcp/</code> endpoint for external agents.
          </p>

          <div className="hero-cta">
            <button className="btn btn-primary btn-lg" onClick={user ? onEnter : () => focusSignIn("signup")}>
              {user ? "Open the app →" : "Create account"}
            </button>
            <button className="btn btn-lg btn-quiet" onClick={() => focusSignIn()}>
              {user ? "Your account" : "Sign in"}
            </button>
          </div>

          <dl className="stat-row">
            <div>
              <dt>In-page tools</dt>
              <dd>{PROMPT_TOOLS.length}</dd>
            </div>
            <div>
              <dt>Remote tools</dt>
              <dd>{remoteMcp.tools.length}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd className="stat-protocol">2026</dd>
            </div>
          </dl>
        </Section>

        {/* Sign in --------------------------------------------------- */}
        <section className="signin-section" aria-label="Your account">
            <div className="signin-card" id="signin">
              {checking ? (
                <p className="signin-note">Checking your session…</p>
              ) : recovering ? (
                <>
                  <h3 className="signin-title">Set a new password</h3>
                  <p className="signin-note">Choose a new password for your account.</p>
                  <form
                    className="signin-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitNewPassword();
                    }}
                  >
                    {passwordField}
                    <button className="btn btn-primary" type="submit" disabled={authState.kind === "sending"}>
                      {authState.kind === "sending" ? "Saving…" : "Save new password"}
                    </button>
                  </form>
                </>
              ) : user ? (
                <>
                  <strong>Signed in as {user.email ?? "your account"}</strong>
                  <p className="signin-note">
                    Your forum posts will be published under this account. You can
                    sign out from inside the app at any time.
                  </p>
                  <div className="signin-row">
                    <button className="btn btn-primary" onClick={onEnter}>
                        Open the app →
                    </button>
                    <button className="btn btn-quiet" onClick={() => void signOut()}>
                        Sign out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="signin-title">{authMode === "signup" ? "Create your account" : authMode === "forgot" ? "Reset your password" : "Welcome back"}</h3>
                  <p className="signin-note">
                    Sign in or create an account to open the app and publish forum
                    posts under your name.
                  </p>
                  <form
                    className="signin-row"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void (authMode === "signup" ? submitSignUp() : authMode === "forgot" ? submitReset() : submitSignIn());
                    }}
                  >
                    {authMode === "signup" && (
                      <>
                        <label htmlFor="signup-username">Username</label>
                        <input
                          id="signup-username"
                          className="input"
                          autoComplete="username"
                          placeholder="e.g. jason_yan"
                          aria-describedby="signup-username-help"
                          required
                          minLength={3}
                          maxLength={24}
                          pattern="[A-Za-z0-9_]{3,24}"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                        />
                        <small id="signup-username-help" className="signin-note">
                          Your public handle. Use 3–24 letters, numbers, or underscores.
                        </small>
                      </>
                    )}
                    <input
                        ref={emailRef}
                        className="input"
                        type="email"
                        autoComplete="email"
                        aria-label="Email address"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                    {authMode !== "forgot" && passwordField}
                    <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={authState.kind === "sending"}
                    >
                        {authState.kind === "sending"
                          ? (authMode === "signup" ? "Creating account…" : authMode === "forgot" ? "Sending…" : "Signing in…")
                          : (authMode === "signup" ? "Create account" : authMode === "forgot" ? "Send reset link" : "Sign in")}
                    </button>
                    {authMode === "signin" && (
                      <button
                          className="btn btn-quiet"
                          type="button"
                          onClick={() => focusSignIn("forgot")}
                          disabled={authState.kind === "sending"}
                      >
                          Forgot password?
                      </button>
                    )}
                    <button
                        className="btn btn-quiet"
                        type="button"
                        onClick={() => focusSignIn(authMode === "signin" ? "signup" : "signin")}
                        disabled={authState.kind === "sending"}
                    >
                        {authMode === "signin" ? "New here? Create an account" : authMode === "forgot" ? "Back to sign in" : "Already have an account? Sign in"}
                    </button>
                  </form>
                </>
              )}
              {"text" in authState && (
                <p
                  className={`signin-note${authState.kind === "error" ? " is-bad" : " is-good"}`}
                  role="status"
                >
                  {authState.text}
                </p>
              )}
            </div>
        </section>
        </div>

        {/* Remote MCP ------------------------------------------------ */}
        <Section className="remote-connect">
          <div id="connect" className="remote-connect-copy">
            <span className="kicker">Remote MCP</span>
            <h3 className="section-title">Give any agent one URL.</h3>
            <p className="section-sub">
              External agents connect over standard Streamable HTTP and work
              directly with Prompt Lab's durable shared library. No browser tab
              or UI automation is required.
            </p>
          </div>

          <div className="endpoint-card">
            <div className="endpoint-head">
              <span
                className={`status ${remoteMcp.ready ? "is-ready" : "is-off"}`}
              >
                <span className="dot" />
                {remoteMcp.ready
                  ? "Endpoint online"
                  : remoteMcp.checking
                    ? "Checking endpoint…"
                    : "Available after Sites deployment"}
              </span>
              <span>{remoteMcp.transport}</span>
            </div>
            <div className="endpoint-url-row">
              <code>{remoteMcp.endpoint}</code>
              <button className="btn btn-primary" onClick={copyEndpoint}>
                {copiedEndpoint ? "Copied ✓" : "Copy URL"}
              </button>
            </div>
            <div className="endpoint-meta">
              <span>{remoteMcp.tools.length} remote tools</span>
              <span>{remoteMcp.protocolVersions.join(" + ")}</span>
              <span>Version history included</span>
            </div>
          </div>
        </Section>

        {/* Code ------------------------------------------------------- */}
        <Section className="code-block">
          <div className="code-head">
            <span className="code-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="code-file">src/lib/webmcp.ts</span>
            <button className="btn btn-ghost" onClick={copySnippet}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="code-body">{SNIPPET}</pre>
        </Section>

        {/* Tool index ------------------------------------------------- */}
        <Section className="lp-section" >
          <div id="tools" className="section-head">
            <span className="kicker">Index</span>
            <h3 className="section-title">The complete tool surface</h3>
            <p className="section-sub">
              Rendered straight from the live registry — this list cannot drift
              from what the page actually registers. Select one to read its
              schema.
            </p>
          </div>

          <ul className="tool-index">
            {PROMPT_TOOLS.map((tool, index) => {
              const open = openTool === tool.name;
              const required = tool.inputSchema.required ?? [];
              const params = Object.keys(tool.inputSchema.properties ?? {});

              return (
                <li key={tool.name} className={`tool-row${open ? " is-open" : ""}`}>
                  <button
                    className="tool-row-head"
                    onClick={() => setOpenTool(open ? null : tool.name)}
                    aria-expanded={open}
                  >
                    <span className="tool-n">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="tool-name">{tool.name}</span>
                    <span className="tool-desc">{tool.description}</span>
                    <span className="tool-flags">
                      {tool.annotations?.readOnlyHint && (
                        <span className="flag flag-read">read</span>
                      )}
                      {tool.annotations?.destructiveHint && (
                        <span className="flag flag-danger">destructive</span>
                      )}
                      {!tool.annotations?.readOnlyHint &&
                        !tool.annotations?.destructiveHint && (
                          <span className="flag flag-write">write</span>
                        )}
                    </span>
                    <span className="tool-caret" aria-hidden="true">
                      ↓
                    </span>
                  </button>

                  {open && (
                    <div className="tool-row-body">
                      <div className="params">
                        {params.length === 0 && (
                          <span className="param-none">No parameters.</span>
                        )}
                        {params.map((param) => (
                          <span
                            key={param}
                            className={`param${required.includes(param) ? " is-required" : ""}`}
                          >
                            {param}
                            {required.includes(param) && <i>*</i>}
                          </span>
                        ))}
                      </div>
                      <pre className="schema">
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {/* How -------------------------------------------------------- */}
        <Section className="lp-section">
          <div id="how" className="section-head">
            <span className="kicker">Mechanism</span>
            <h3 className="section-title">How it works</h3>
          </div>

          <div className="steps">
            {STEPS.map((step) => (
              <article className="step" key={step.n}>
                <span className="step-n">{step.n}</span>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </Section>

        {/* Closing ---------------------------------------------------- */}
        <Section className="closing">
          <h3 className="display closing-title">
            Open it with an agent
            <br />
            <em>and watch it work.</em>
          </h3>
          <p className="lede">
            Connect an external agent to <code>{remoteMcp.endpoint}</code>, use
            browser-native WebMCP in a supported browser, or run the optional
            local Llama agent inside the app.
          </p>
          <button className="btn btn-primary btn-lg" onClick={user ? onEnter : () => focusSignIn("signup")}>
            {user ? "Open the app →" : "Create account"}
          </button>
        </Section>
      </main>

      <footer className="lp-foot">
        <span>Prompt Lab · built for the WebMCP Challenge</span>
        <a
          href="https://github.com/jasonyannn/prompt-lab"
          target="_blank"
          rel="noreferrer"
        >
          Source (AGPL-3.0)
        </a>
        <a href="https://ko-fi.com/officialpromptlab" target="_blank" rel="noreferrer">
          Support on Ko-fi
        </a>
      </footer>
    </div>
  );
}
