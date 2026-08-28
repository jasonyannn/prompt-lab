import type { Prompt } from "../lib/promptStore";

type Props = {
  prompts: Prompt[];
  selectedId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function PromptList({
  prompts,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onNew,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Library · {prompts.length}</h2>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost" onClick={onNew}>
          + New
        </button>
      </div>

      <div className="panel-body" style={{ paddingBottom: 12 }}>
        <input
          className="input"
          placeholder="Search prompts…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search prompts"
        />
      </div>

      <div className="panel-scroll">
        {prompts.length === 0 ? (
          <p className="empty">No prompts match that search.</p>
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
                <span>★ {prompt.rating ? prompt.rating.toFixed(1) : "—"}</span>
                <span>{prompt.usageCount}× used</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
