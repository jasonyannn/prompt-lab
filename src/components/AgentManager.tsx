import { useEffect, useState } from "react";
import { agentStore, type PromptAgent } from "../lib/agentStore";

type Props = {
  agents: PromptAgent[];
  selectedId: string | null;
  promptCounts: Record<string, number>;
  onSelect: (id: string) => void;
};

type AgentDraft = {
  name: string;
  role: string;
  instructions: string;
  defaultCategory: string;
};

const EMPTY_DRAFT: AgentDraft = {
  name: "",
  role: "",
  instructions: "",
  defaultCategory: "General",
};

export function AgentManager({ agents, selectedId, promptCounts, onSelect }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (selectedId && !agents.some((agent) => agent.id === selectedId)) {
      const next = agents[0];
      if (next) onSelect(next.id);
    }
  }, [agents, onSelect, selectedId]);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setConfirmDelete(false);
    setShowForm(true);
  }

  function startEdit(agent: PromptAgent) {
    setEditingId(agent.id);
    setDraft({
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
      defaultCategory: agent.defaultCategory,
    });
    setConfirmDelete(false);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setConfirmDelete(false);
  }

  function save() {
    if (!draft.name.trim() || !draft.role.trim() || !draft.instructions.trim()) return;

    const input = {
      name: draft.name.trim(),
      role: draft.role.trim(),
      instructions: draft.instructions.trim(),
      defaultCategory: draft.defaultCategory.trim() || "General",
    };

    if (editingId) {
      agentStore.update(editingId, input);
      onSelect(editingId);
    } else {
      const agent = agentStore.create(input);
      onSelect(agent.id);
    }
    closeForm();
  }

  function remove() {
    if (!editingId) return;
    agentStore.remove(editingId);
    closeForm();
  }

  const canSave =
    draft.name.trim() !== "" &&
    draft.role.trim() !== "" &&
    draft.instructions.trim() !== "";

  return (
    <section className="panel agent-panel">
      <div className="panel-head">
        <h2>Your agents · {agents.length}</h2>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost" onClick={startCreate}>
          + New
        </button>
      </div>

      {showForm ? (
        <div className="panel-body agent-form">
          <div className="field">
            <label className="label" htmlFor="agent-name">Name</label>
            <input
              id="agent-name"
              className="input"
              placeholder="e.g. Design Director"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="agent-role">Expert role</label>
            <input
              id="agent-role"
              className="input"
              placeholder="Senior product designer"
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="agent-instructions">How should it think?</label>
            <textarea
              id="agent-instructions"
              className="textarea textarea-compact"
              placeholder="Prioritise usability, ask for missing context…"
              value={draft.instructions}
              onChange={(event) =>
                setDraft({ ...draft, instructions: event.target.value })
              }
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="agent-category">Default category</label>
            <input
              id="agent-category"
              className="input"
              value={draft.defaultCategory}
              onChange={(event) =>
                setDraft({ ...draft, defaultCategory: event.target.value })
              }
            />
          </div>
          <div className="row agent-form-actions">
            {editingId &&
              (confirmDelete ? (
                <>
                  <button className="btn btn-danger" onClick={remove}>Delete agent</button>
                  <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              ))}
            <div className="topbar-spacer" />
            <button className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            <button className="btn btn-primary" disabled={!canSave} onClick={save}>
              {editingId ? "Save" : "Create agent"}
            </button>
          </div>
          {confirmDelete && (promptCounts[editingId ?? ""] ?? 0) > 0 && (
            <p className="hint">
              Saved prompts stay in the library; they will simply become unassigned.
            </p>
          )}
        </div>
      ) : (
        <div className="agent-list">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`agent-card${agent.id === selectedId ? " is-active" : ""}`}
            >
              <button className="agent-card-main" onClick={() => onSelect(agent.id)}>
                <span className="agent-avatar" aria-hidden="true">
                  {agent.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="agent-card-copy">
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                  <small>
                    {promptCounts[agent.id] ?? 0} prompt
                    {(promptCounts[agent.id] ?? 0) === 1 ? "" : "s"}
                  </small>
                </span>
              </button>
              <button
                className="agent-edit"
                aria-label={`Edit ${agent.name}`}
                title={`Edit ${agent.name}`}
                onClick={() => startEdit(agent)}
              >
                ···
              </button>
            </div>
          ))}
          {agents.length === 0 && (
            <div className="empty-state-compact">
              <p>Create an agent to give your prompt packs a reusable point of view.</p>
              <button className="btn btn-primary" onClick={startCreate}>Create agent</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
