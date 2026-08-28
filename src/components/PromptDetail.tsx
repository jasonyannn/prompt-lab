import { useEffect, useMemo, useState } from "react";
import { promptStore, type Prompt } from "../lib/promptStore";
import type { PromptAgent } from "../lib/agentStore";
import { extractVariables, renderPrompt } from "../lib/variables";

type Props = {
  prompt: Prompt;
  agents: PromptAgent[];
};

export function PromptDetail({ prompt, agents }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(prompt.title);
  const [category, setCategory] = useState(prompt.category);
  const [content, setContent] = useState(prompt.content);
  const [agentId, setAgentId] = useState(prompt.agentId ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const variables = useMemo(
    () => extractVariables(prompt.content),
    [prompt.content]
  );

  const rendered = useMemo(
    () => renderPrompt(prompt.content, values),
    [prompt.content, values]
  );

  const unfilled = variables.filter((name) => !values[name]?.trim());

  // An agent tool call can change this prompt underneath us — resync on change.
  useEffect(() => {
    setTitle(prompt.title);
    setCategory(prompt.category);
    setContent(prompt.content);
    setAgentId(prompt.agentId ?? "");
    setEditing(false);
    setConfirmDelete(false);
  }, [
    prompt.id,
    prompt.updatedAt,
    prompt.title,
    prompt.category,
    prompt.content,
    prompt.agentId,
  ]);

  useEffect(() => {
    setValues({});
  }, [prompt.id]);

  async function copyAndRecord() {
    try {
      await navigator.clipboard.writeText(rendered);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; still count the use.
    }
    promptStore.recordUse(prompt.id);
  }

  function save() {
    promptStore.update(prompt.id, {
      title,
      category,
      content,
      agentId: agentId || undefined,
    });
    setEditing(false);
  }

  function duplicate() {
    promptStore.create({
      title: `${prompt.title} (copy)`,
      content: prompt.content,
      category: prompt.category,
      agentId: prompt.agentId,
    });
  }

  if (editing) {
    return (
      <section className="panel detail-panel">
        <div className="panel-head">
          <h2>Editing</h2>
          <div className="topbar-spacer" />
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>

        <div className="panel-body">
          <div className="field">
            <label className="label" htmlFor="edit-agent">
              Agent <span className="optional">optional</span>
            </label>
            <select
              id="edit-agent"
              className="select"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              <option value="">No agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
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
              Prompt · wrap variables in {"{{double braces}}"}
            </label>
            <textarea
              id="edit-content"
              className="textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel detail-panel">
      <div className="panel-head">
        <h2>Prompt</h2>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost" onClick={duplicate}>
          Duplicate
        </button>
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
        {confirmDelete ? (
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => promptStore.remove(prompt.id)}
            >
              Delete for good
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
        <button className="btn btn-primary" onClick={copyAndRecord}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="panel-body">
        <h3 className="detail-title">{prompt.title}</h3>

        <div className="row detail-meta">
          <span className="tag">{prompt.category}</span>
          {prompt.agentId && agents.some((agent) => agent.id === prompt.agentId) && (
            <span className="agent-byline">
              by {agents.find((agent) => agent.id === prompt.agentId)?.name}
            </span>
          )}

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
          <code className="id-chip">{prompt.id}</code>
        </div>

        {variables.length > 0 && (
          <div className="vars">
            <div className="vars-head">
              <span className="label" style={{ margin: 0 }}>
                Variables
              </span>
              <span className="hint" style={{ margin: 0 }}>
                {unfilled.length === 0
                  ? "all filled"
                  : `${unfilled.length} to fill`}
              </span>
            </div>
            <div className="vars-grid">
              {variables.map((name) => (
                <input
                  key={name}
                  className="input"
                  placeholder={name}
                  value={values[name] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [name]: event.target.value }))
                  }
                  aria-label={`Value for ${name}`}
                />
              ))}
            </div>
          </div>
        )}

        <pre className="prompt-body">{rendered}</pre>
      </div>
    </section>
  );
}
