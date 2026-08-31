import { useState } from "react";
import { promptStore } from "../lib/promptStore";
import { categoryStore } from "../lib/categoryStore";
import { useCategories } from "../hooks/useCategories";
import type { PromptAgent } from "../lib/agentStore";

type Props = {
  onCreated: (id: string) => void;
  onCancel: () => void;
  agents: PromptAgent[];
};

export function NewPromptForm({ onCreated, onCancel, agents }: Props) {
  const { categories } = useCategories();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [content, setContent] = useState("");
  const [agentId, setAgentId] = useState("");

  const canSave = title.trim() !== "" && content.trim() !== "";

  function save() {
    if (!canSave) return;
    const named = category.trim() || "General";
    categoryStore.ensure(named);
    const prompt = promptStore.create({
      title: title.trim(),
      content: content.trim(),
      category: named,
      agentId: agentId || undefined,
    });
    onCreated(prompt.id);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>New Prompt</h2>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!canSave} onClick={save}>
          Save prompt
        </button>
      </div>

      <div className="panel-body">
        <div className="field">
          <label className="label" htmlFor="new-agent">
            Agent <span className="optional">optional</span>
          </label>
          <select
            id="new-agent"
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
          <label className="label" htmlFor="new-title">
            Title
          </label>
          <input
            id="new-title"
            className="input"
            placeholder="e.g. Competitive Teardown"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="new-category">
            Category
          </label>
          <input
            id="new-category"
            className="input"
            list="prompt-categories"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <datalist id="prompt-categories">
            {categories.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label className="label" htmlFor="new-content">
            Prompt
          </label>
          <textarea
            id="new-content"
            className="textarea"
            placeholder="Act as a…"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
