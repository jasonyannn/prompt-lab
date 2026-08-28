import { useEffect, useMemo, useState } from "react";
import { useWebMCP } from "./hooks/useWebMCP";
import { usePrompts } from "./hooks/usePrompts";
import { WebMCPStatus } from "./components/WebMCPStatus";
import { AgentActivity } from "./components/AgentActivity";
import { PromptList } from "./components/PromptList";
import { PromptDetail } from "./components/PromptDetail";
import { NewPromptForm } from "./components/NewPromptForm";

export default function App() {
  // Registers the six Prompt Lab tools on document.modelContext. Called once,
  // from the root component.
  const { ready, supported, tools, activity, clearActivity } = useWebMCP();

  const { prompts } = usePrompts();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => prompts[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter((prompt) =>
      [prompt.title, prompt.content, prompt.category]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [prompts, query]);

  // Keep a valid selection when agents create or remove prompts under us.
  useEffect(() => {
    if (prompts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !prompts.some((prompt) => prompt.id === selectedId)) {
      setSelectedId(prompts[0].id);
    }
  }, [prompts, selectedId]);

  const selected = prompts.find((prompt) => prompt.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Prompt Lab</h1>
          <span>agent-ready prompt library</span>
        </div>
        <div className="topbar-spacer" />
        <WebMCPStatus ready={ready} supported={supported} toolCount={tools.length} />
      </header>

      <div className="columns">
        <PromptList
          prompts={visible}
          selectedId={selectedId}
          query={query}
          onQueryChange={setQuery}
          onSelect={(id) => {
            setSelectedId(id);
            setCreating(false);
          }}
          onNew={() => setCreating(true)}
        />

        {creating ? (
          <NewPromptForm
            onCreated={(id) => {
              setSelectedId(id);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <PromptDetail key={selected.id} prompt={selected} />
        ) : (
          <section className="panel">
            <div className="panel-head">
              <h2>Prompt</h2>
            </div>
            <p className="empty">
              Your library is empty. Create a prompt, or ask an agent to call{" "}
              <code>create_prompt</code>.
            </p>
          </section>
        )}

        <AgentActivity
          activity={activity}
          tools={tools}
          onClear={clearActivity}
        />
      </div>
    </div>
  );
}
