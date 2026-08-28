import { useEffect, useRef, useState } from "react";
import { PROMPT_TOOLS } from "../lib/webmcp";
import type { WebMCPState } from "../hooks/useWebMCP";

type Props = {
  webmcp: WebMCPState;
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
    title: "The page declares its tools",
    body: "On load, Prompt Lab registers its typed tools against the browser's own model context. No plugin, no server, no bespoke protocol.",
  },
  {
    n: "02",
    title: "Your agent discovers them",
    body: "Any WebMCP-capable agent reads the schemas and calls them directly — with the same permissions, session and data you already have on the page.",
  },
  {
    n: "03",
    title: "The interface answers back",
    body: "Every call mutates the live store, so the UI updates as you watch. The Activity feed shows each call, labelled by who made it.",
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

export function Landing({ webmcp, onEnter }: Props) {
  const [openTool, setOpenTool] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked; the code is visible on screen regardless */
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
              className={`status ${webmcp.ready ? "is-ready" : "is-off"}`}
              title={
                webmcp.ready
                  ? `${webmcp.tools.length} tools registered on document.modelContext`
                  : "This browser does not expose document.modelContext"
              }
            >
              <span className="dot" />
              {webmcp.ready
                ? `WebMCP Ready · ${webmcp.tools.length}`
                : webmcp.supported
                  ? "Connecting…"
                  : "WebMCP unavailable"}
            </span>
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
            Lab hands it a complete set of typed tools instead — registered on the browser's
            native <code>document.modelContext</code>, so anything it can do, you
            can watch it do.
          </p>

          <div className="hero-cta">
            <button className="btn btn-primary btn-lg" onClick={onEnter}>
              Open the app →
            </button>
            <a className="btn btn-lg btn-quiet" href="#tools">
              Explore the tools
            </a>
          </div>

          <dl className="stat-row">
            <div>
              <dt>Tools exposed</dt>
              <dd>{PROMPT_TOOLS.length}</dd>
            </div>
            <div>
              <dt>Backend services</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Agent lock-in</dt>
              <dd>None</dd>
            </div>
          </dl>
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
            Best in ChatGPT's in-app browser or Chrome 149+ with WebMCP enabled.
            No agent handy? A local Llama 3.2 runs the same tools from inside the
            app.
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
