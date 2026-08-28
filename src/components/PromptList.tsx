import type { Prompt } from "../lib/promptStore";

export type SortKey = "recent" | "used" | "rated" | "title";

type Props = {
  prompts: Prompt[];
  categories: string[];
  activeCategory: string;
  sort: SortKey;
  selectedId: string | null;
  query: string;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: SortKey) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function PromptList({
  prompts,
  categories,
  activeCategory,
  sort,
  selectedId,
  query,
  totalCount,
  onQueryChange,
  onCategoryChange,
  onSortChange,
  onSelect,
  onNew,
}: Props) {
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
