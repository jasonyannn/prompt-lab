import type { Prompt } from "../lib/promptStore";
import { useState } from "react";
import { categoryStore } from "../lib/categoryStore";
import type { PromptAgent } from "../lib/agentStore";

export type SortKey = "recent" | "used" | "rated" | "title";

type Props = {
  prompts: Prompt[];
  categories: string[];
  agents: PromptAgent[];
  activeCategory: string;
  activeAgent: string;
  sort: SortKey;
  selectedId: string | null;
  query: string;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: string) => void;
  onAgentChange: (agentId: string) => void;
  onSortChange: (sort: SortKey) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function PromptList({
  prompts,
  categories,
  agents,
  activeCategory,
  activeAgent,
  sort,
  selectedId,
  query,
  totalCount,
  onQueryChange,
  onCategoryChange,
  onAgentChange,
  onSortChange,
  onSelect,
  onNew,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <section className="panel list-panel">
      <div className="panel-head">
        <h2>
          Library · {prompts.length}
          {prompts.length !== totalCount && (
            <span className="of-total"> of {totalCount}</span>
          )}
        </h2>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost" onClick={onNew}>
          + New
        </button>
      </div>

      <div className="list-controls">
        <input
          className="input"
          placeholder="Search prompts…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search prompts"
        />

        <div className="chips">
          <button
            className={`chip${activeCategory === "All" ? " is-active" : ""}`}
            onClick={() => onCategoryChange("All")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={`chip${activeCategory === category ? " is-active" : ""}`}
              onClick={() => onCategoryChange(category)}
            >
              {category}
            </button>
          ))}

          {adding ? (
            <form
              className="chip-form"
              onSubmit={(event) => {
                event.preventDefault();
                const created = categoryStore.create(draft);
                if (created) onCategoryChange(created);
                setDraft("");
                setAdding(false);
              }}
            >
              <input
                className="chip-input"
                aria-label="New category name"
                placeholder="Category name"
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraft("");
                    setAdding(false);
                  }
                }}
                onBlur={() => {
                  if (!draft.trim()) setAdding(false);
                }}
              />
              <button className="chip chip-add" type="submit" disabled={!draft.trim()}>
                Add
              </button>
            </form>
          ) : (
            <button
              className="chip chip-add"
              title="Create a category"
              onClick={() => setAdding(true)}
            >
              + New
            </button>
          )}
        </div>

        <select
          className="select"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          aria-label="Sort prompts"
        >
          <option value="recent">Recently updated</option>
          <option value="used">Most used</option>
          <option value="rated">Highest rated</option>
          <option value="title">Title A–Z</option>
        </select>

        <select
          className="select"
          value={activeAgent}
          onChange={(event) => onAgentChange(event.target.value)}
          aria-label="Filter prompts by agent"
        >
          <option value="All">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      <div className="list-scroll">
        {prompts.length === 0 ? (
          <p className="empty">Nothing matches those filters.</p>
        ) : (
          prompts.map((prompt) => (
            <button
              key={prompt.id}
              className={`prompt-item${prompt.id === selectedId ? " is-active" : ""}`}
              onClick={() => onSelect(prompt.id)}
            >
              <h3>{prompt.title}</h3>
              <div className="meta">
                <span className="tag">{prompt.category}</span>
                {prompt.agentId && agents.some((agent) => agent.id === prompt.agentId) && (
                  <span className="prompt-agent-name">
                    {agents.find((agent) => agent.id === prompt.agentId)?.name}
                  </span>
                )}
                <span>{prompt.rating ? `★ ${prompt.rating.toFixed(1)}` : "unrated"}</span>
                <span>{prompt.usageCount}× used</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
