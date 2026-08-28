import { useEffect, useMemo, useRef, useState } from "react";
import { useWebMCP } from "./hooks/useWebMCP";
import { usePrompts } from "./hooks/usePrompts";
import { promptStore } from "./lib/promptStore";
import { WebMCPStatus } from "./components/WebMCPStatus";
import { RightRail } from "./components/RightRail";
import { PromptList, type SortKey } from "./components/PromptList";
import { PromptDetail } from "./components/PromptDetail";
import { NewPromptForm } from "./components/NewPromptForm";

export default function App() {
  // Registers the Prompt Lab tools on document.modelContext. Called once,
  // from the root component.
  const { ready, supported, tools, activity, clearActivity } = useWebMCP();

  const { prompts } = usePrompts();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => prompts[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(
    () => [...new Set(prompts.map((prompt) => prompt.category))].sort(),
    [prompts]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = prompts.filter((prompt) => {
      if (category !== "All" && prompt.category !== category) return false;
      if (!q) return true;
      return [prompt.title, prompt.content, prompt.category]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "used":
          return b.usageCount - a.usageCount;
        case "rated":
          return (b.rating ?? 0) - (a.rating ?? 0);
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [prompts, query, category, sort]);

  // Keep a valid selection when agents create or delete prompts under us.
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

  function exportLibrary() {
    const blob = new Blob([JSON.stringify(promptStore.getAll(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prompt-lab.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importLibrary(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("not an array");
      for (const entry of parsed) {
        if (typeof entry?.title === "string" && typeof entry?.content === "string") {
          promptStore.create({
            title: entry.title,
            content: entry.content,
            category: typeof entry.category === "string" ? entry.category : undefined,
          });
        }
      }
    } catch {
      window.alert("That file isn't a Prompt Lab export.");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <h1>Prompt Lab</h1>
          <span className="tagline">agent-ready prompt library</span>
        </div>

        <div className="topbar-spacer" />

        <button className="btn btn-ghost" onClick={exportLibrary}>
          Export
        </button>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importLibrary(file);
            event.target.value = "";
          }}
        />

        <WebMCPStatus ready={ready} supported={supported} toolCount={tools.length} />
      </header>

      <div className="columns">
        <PromptList
          prompts={visible}
          categories={categories}
          activeCategory={category}
          sort={sort}
          selectedId={selectedId}
          query={query}
          totalCount={prompts.length}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onSortChange={setSort}
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
          <section className="panel detail-panel">
            <div className="panel-head">
              <h2>Prompt</h2>
            </div>
            <p className="empty">
              Your library is empty. Create a prompt, or ask an agent to call{" "}
              <code>create_prompt</code>.
            </p>
          </section>
        )}

        <RightRail activity={activity} tools={tools} onClear={clearActivity} />
      </div>
    </div>
  );
}
