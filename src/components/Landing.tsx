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
    body: "Give an external agent the /mcp URL. It discovers a typed Streamable HTTP tool surface without opening or clicking through the interface.",
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
  const { user, checking, signIn, signUp, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  /** Scroll to the card *and* focus the field, so one click is enough. */
  function focusSignIn() {
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

  async function submitSignUp() {
    const address = email.trim();
    if (!address || !password.trim()) {
      setAuthState({ kind: "error", text: "Enter both your email and password." });
      return;
    }
    setAuthState({ kind: "sending" });
    try {
      await signUp(address, password);
      setAuthState({
        kind: "sent",
        text: `Account created for ${address}. You can now sign in with the same email and password.`,
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
            <button className="btn btn-quiet" onClick={focusSignIn}>
              {user ? (user.email ?? "Account") : "Sign in"}
            </button>
            <button className="btn btn-primary" onClick={onEnter}>
              Open the app
            </button>
          </div>
        </div>
      </header>

      <main className="lp-main">
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
            <code>/mcp</code> endpoint for external agents.
          </p>

          <div className="hero-cta">
            <button className="btn btn-primary btn-lg" onClick={onEnter}>
              Open the app →
            </button>
            <button className="btn btn-lg btn-quiet" onClick={focusSignIn}>
              {user ? "Your account" : "Sign in"}
            </button>
            <a className="btn btn-lg btn-quiet" href="#tools">
              Explore the tools
            </a>
            <a className="btn btn-lg btn-quiet" href="#connect">
              Connect an agent
            </a>
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
        <Section className="signin-section">
            <div className="signin-card" id="signin">
              {checking ? (
                <p className="signin-note">Checking your session…</p>
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
                  <strong>Sign in or create an account</strong>
                  <p className="signin-note">
                    Optional — everything in Prompt Lab works signed out, and you
                    can post to the forum anonymously. Signing in just lets posts
                    carry your name. This uses Supabase email/password auth instead
                    of a reset-by-email magic link.
                  </p>
                  <form
                    className="signin-row"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submitSignIn();
                    }}
                  >
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
                    <input
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        aria-label="Password"
                        placeholder="Password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={authState.kind === "sending"}
                    >
                        {authState.kind === "sending" ? "Signing in…" : "Sign in"}
                    </button>
                    <button
                        className="btn btn-quiet"
                        type="button"
                        onClick={() => void submitSignUp()}
                        disabled={authState.kind === "sending"}
                    >
                        Create account
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
        </Section>

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
          <button className="btn btn-primary btn-lg" onClick={onEnter}>
            Open the app →
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
          Source (MIT)
        </a>
      </footer>
    </div>
  );
}
