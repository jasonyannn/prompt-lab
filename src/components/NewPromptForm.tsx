import { useState } from "react";
import { promptStore } from "../lib/promptStore";

type Props = {
  onCreated: (id: string) => void;
  onCancel: () => void;
};

export function NewPromptForm({ onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [content, setContent] = useState("");

  const canSave = title.trim() !== "" && content.trim() !== "";

  function save() {
    if (!canSave) return;
    const prompt = promptStore.create({
      title: title.trim(),
      content: content.trim(),
      category: category.trim() || "General",
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
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
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
