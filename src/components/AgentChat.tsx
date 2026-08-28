import { useEffect, useRef, useState } from "react";
import {
  chat,
  checkOllama,
  DEFAULT_MODEL,
  getModel,
  setModel,
  type ChatMessage,
  type OllamaStatus,
} from "../lib/ollama";

const SUGGESTIONS = [
  "What prompts do I have?",
  "Save a prompt for writing release notes",
  "Rate the UX audit prompt 5 stars",
];

export function AgentChat() {
  const [status, setStatus] = useState<OllamaStatus>({ state: "checking" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModelState] = useState(() => getModel());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void checkOllama().then(setStatus);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setError(null);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setBusy(true);

    try {
      const added = await chat(next, {
        onAssistant: (message) => setMessages((prev) => [...prev, message]),
        onToolCall: (name, _input, result) =>
          setMessages((prev) => [
            ...prev,
            { role: "tool", content: result, tool_name: name },
          ]),
      });
      // chat() reports incrementally; keep only the authoritative final list.
      setMessages([...next, ...added]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function applyModel(value: string) {
    setModelState(value);
    setModel(value);
  }

  if (status.state === "checking") {
    return (
      <div className="panel-body">
        <p className="empty">Looking for Ollama…</p>
      </div>
    );
  }

  if (status.state === "unavailable") {
    return (
      <div className="panel-body">
        <div className="notice">
          <strong>Local agent offline</strong>
          <p>{status.reason}</p>
        </div>
        <p className="hint">
          The built-in agent is optional. WebMCP tools stay registered for the
          browser's own agent either way.
        </p>
        <button
          className="btn"
          style={{ marginTop: 10 }}
          onClick={() => {
            setStatus({ state: "checking" });
            void checkOllama().then(setStatus);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const hasModel = status.models.some((name) => name.startsWith(model));

  return (
    <div className="chat">
      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-intro">
            <p className="empty" style={{ padding: "10px 0" }}>
              Llama 3.2 running locally, wired to the same tools.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="suggestion"
                onClick={() => void send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, index) => {
          if (message.role === "tool") {
            return (
              <div className="bubble-tool" key={index}>
                <span className="activity-tool">{message.tool_name}</span>
                <span className="tool-ok">✓ ran</span>
              </div>
            );
          }

          const calls = message.tool_calls ?? [];
          if (message.role === "assistant" && !message.content && calls.length) {
            return (
              <div className="bubble-tool" key={index}>
                calling {calls.map((call) => call.function.name).join(", ")}…
              </div>
            );
          }

          if (!message.content) return null;

          return (
            <div className={`bubble bubble-${message.role}`} key={index}>
              {message.content}
            </div>
          );
        })}

        {busy && <div className="bubble-tool">thinking…</div>}
        {error && <div className="notice is-bad">{error}</div>}
      </div>

      {!hasModel && (
        <p className="hint" style={{ padding: "0 14px" }}>
          Model <code>{model}</code> not found. Run{" "}
          <code>ollama pull {model}</code>.
        </p>
      )}

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          className="input"
          placeholder="Ask the local agent…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          aria-label="Message the local agent"
        />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>

      <div className="chat-foot">
        <input
          className="model-input"
          value={model}
          onChange={(event) => applyModel(event.target.value)}
          aria-label="Ollama model"
          placeholder={DEFAULT_MODEL}
        />
        <span className="hint" style={{ margin: 0 }}>
          {status.models.length} model{status.models.length === 1 ? "" : "s"} local
        </span>
        {messages.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setMessages([])}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
