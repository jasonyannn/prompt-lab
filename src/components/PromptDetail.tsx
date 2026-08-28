import { useEffect, useState } from "react";
import { promptStore, type Prompt } from "../lib/promptStore";

type Props = {
  prompt: Prompt;
};

export function PromptDetail({ prompt }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(prompt.title);
  const [category, setCategory] = useState(prompt.category);
  const [content, setContent] = useState(prompt.content);
  const [copied, setCopied] = useState(false);

  // An agent tool call can change this prompt underneath us — resync on change.
  useEffect(() => {
    setTitle(prompt.title);
    setCategory(prompt.category);
    setContent(prompt.content);
    setEditing(false);
  }, [prompt.id, prompt.updatedAt, prompt.title, prompt.category, prompt.content]);

  async function copyAndRecord() {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; still count the use.
    }
    promptStore.recordUse(prompt.id);
  }

  function save() {
    promptStore.update(prompt.id, { title, category, content });
    setEditing(false);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Prompt</h2>
        <div className="topbar-spacer" />
        {editing ? (
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="btn btn-primary" onClick={copyAndRecord}>
              {copied ? "Copied ✓" : "Copy prompt"}
            </button>
          </>
        )}
      </div>

      <div className="panel-body">
        {editing ? (
          <>
            <div className="field">
              <label className="label" htmlFor="edit-title">
                Title
              </label>
              <input
                id="edit-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="edit-category">
                Category
              </label>
              <input
                id="edit-category"
                className="input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="edit-content">
                Prompt
              </label>
              <textarea
                id="edit-content"
                className="textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <h3 className="detail-title">{prompt.title}</h3>

            <div className="row" style={{ margin: "8px 0 14px" }}>
              <span className="tag">{prompt.category}</span>

              <span className="stars" role="group" aria-label="Rate prompt">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    className={`star${value <= Math.round(prompt.rating ?? 0) ? " is-on" : ""}`}
                    aria-label={`Rate ${value} of 5`}
                    onClick={() => promptStore.update(prompt.id, { rating: value })}
                  >
                    ★
                  </button>
                ))}
              </span>

              <span className="meta">
                {prompt.rating ? prompt.rating.toFixed(1) : "unrated"} ·{" "}
                {prompt.usageCount}× used
              </span>

              <div className="topbar-spacer" />
              <code style={{ fontSize: 11, color: "var(--text-faint)" }}>
                id: {prompt.id}
              </code>
            </div>

            <pre className="prompt-body">{prompt.content}</pre>
          </>
        )}
      </div>
    </section>
  );
}
