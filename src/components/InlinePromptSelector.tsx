import { useState } from "react";
import type { ChatPrompt } from "../lib/ollama";

type Props = {
  prompts: ChatPrompt[];
  categories: string[];
  category: string;
  saving: boolean;
  onCategoryChange: (category: string) => void;
  onCreateCategory: (category: string) => string | null;
  onToggle: (id: string, selected: boolean) => void;
  onSaveSelected: () => void;
  onSaveAll: () => void;
};

const PREVIEW_LENGTH = 132;

function preview(prompt: string) {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_LENGTH
    ? `${oneLine.slice(0, PREVIEW_LENGTH).trimEnd()}…`
    : oneLine;
}

export function InlinePromptSelector({
  prompts,
  categories,
  category,
  saving,
  onCategoryChange,
  onCreateCategory,
  onToggle,
  onSaveSelected,
  onSaveAll,
}: Props) {
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const unsaved = prompts.filter((prompt) => !prompt.savedPromptId);
  const selected = unsaved.filter((prompt) => prompt.selected);

  return (
    <div className="inline-prompt-selector">
      <ul className="inline-prompt-list" aria-label="Generated prompts">
        {prompts.map((item) => {
          const isLong = item.prompt.replace(/\s+/g, " ").trim().length > PREVIEW_LENGTH;
          const checkboxId = `generated-prompt-${item.id}`;

          return (
            <li
              className={`inline-prompt-row${item.savedPromptId ? " is-saved" : ""}`}
              key={item.id}
            >
              {item.savedPromptId ? (
                <div className="inline-prompt-main">
                  <span className="inline-prompt-saved-mark" aria-hidden="true">✓</span>
                  <span className="inline-prompt-copy">
                    <span className="inline-prompt-title-line">
                      <strong>{item.title}</strong>
                      <small className="saved-label">Saved</small>
                    </span>
                    <small>{preview(item.prompt)}</small>
                  </span>
                </div>
              ) : (
                <label className="inline-prompt-main" htmlFor={checkboxId}>
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={item.selected}
                    disabled={saving}
                    aria-label={`Select ${item.title}`}
                    onChange={(event) => onToggle(item.id, event.target.checked)}
                  />
                  <span className="inline-prompt-copy">
                    <span className="inline-prompt-title-line">
                      <strong>{item.title}</strong>
                    </span>
                    <small>{preview(item.prompt)}</small>
                  </span>
                </label>
              )}
              {isLong && (
                <details className="inline-prompt-details">
                  <summary>View full prompt</summary>
                  <pre>{item.prompt}</pre>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {unsaved.length > 0 && (
        <div className="inline-prompt-footer">
          <div className="inline-prompt-category">
            <label className="save-into">
              <span>Save to</span>
              <select
                className="select"
                value={category}
                disabled={saving}
                aria-label="Category for generated prompts"
                onChange={(event) => onCategoryChange(event.target.value)}
              >
                {!categories.includes(category) && <option value={category}>{category}</option>}
                {categories.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            {addingCategory ? (
              <form
                className="inline-category-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const created = onCreateCategory(newCategory);
                  if (!created) return;
                  onCategoryChange(created);
                  setNewCategory("");
                  setAddingCategory(false);
                }}
              >
                <input
                  className="input"
                  aria-label="New category name"
                  placeholder="New category"
                  value={newCategory}
                  autoFocus
                  onChange={(event) => setNewCategory(event.target.value)}
                />
                <button className="btn" type="submit" disabled={!newCategory.trim() || saving}>
                  Add
                </button>
              </form>
            ) : (
              <button
                className="btn btn-ghost inline-add-category"
                type="button"
                disabled={saving}
                onClick={() => setAddingCategory(true)}
              >
                + Category
              </button>
            )}
          </div>

          <div className="inline-prompt-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={selected.length === 0 || saving}
              onClick={onSaveSelected}
            >
              {saving ? "Saving…" : `Save selected (${selected.length})`}
            </button>
            <button
              className="btn"
              type="button"
              disabled={unsaved.length === 0 || saving}
              onClick={onSaveAll}
            >
              Save all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
