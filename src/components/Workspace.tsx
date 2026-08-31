import { useEffect, useMemo, useRef, useState } from "react";
import { usePrompts } from "../hooks/usePrompts";
import { useAgents } from "../hooks/useAgents";
import { useCategories } from "../hooks/useCategories";
import { promptStore } from "../lib/promptStore";
import { agentStore } from "../lib/agentStore";
import { categoryStore } from "../lib/categoryStore";
import { WebMCPStatus } from "./WebMCPStatus";
import { RightRail } from "./RightRail";
import { PromptList, type SortKey } from "./PromptList";
import { PromptDetail } from "./PromptDetail";
import { NewPromptForm } from "./NewPromptForm";
import { PromptStudio } from "./PromptStudio";
import type { WebMCPState } from "../hooks/useWebMCP";
import type { RemoteMCPState } from "../hooks/useRemoteMCP";

type Props = {
  webmcp: WebMCPState;
  remoteMcp: RemoteMCPState;
  onHome: () => void;
};

export function Workspace({ webmcp, remoteMcp, onHome }: Props) {
  const { ready, supported, tools, activity, clearActivity } = webmcp;

  const { prompts } = usePrompts();
  const { agents } = useAgents();
  const { categories: savedCategories } = useCategories();
  const [view, setView] = useState<"library" | "studio">("library");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [agentFilter, setAgentFilter] = useState("All");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => prompts[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Saved categories stay selectable even before a prompt lands in them.
  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...savedCategories,
          ...prompts.map((prompt) => prompt.category),
        ]),
      ].sort(),
    [prompts, savedCategories]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = prompts.filter((prompt) => {
      if (category !== "All" && prompt.category !== category) return false;
      if (agentFilter !== "All" && prompt.agentId !== agentFilter) return false;
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
  }, [prompts, query, category, agentFilter, sort]);

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
    const blob = new Blob([JSON.stringify({
      version: 2,
      agents: agentStore.getAll(),
      categories: categoryStore.getAll(),
      prompts: promptStore.getAll(),
    }, null, 2)], {
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
      const entries = Array.isArray(parsed) ? parsed : parsed?.prompts;
      if (!Array.isArray(entries)) throw new Error("missing prompts");

      if (!Array.isArray(parsed) && Array.isArray(parsed.agents)) {
        const validAgents = parsed.agents.filter(
          (entry: unknown) =>
            typeof (entry as { id?: unknown })?.id === "string" &&
            typeof (entry as { name?: unknown })?.name === "string" &&
            typeof (entry as { role?: unknown })?.role === "string" &&
            typeof (entry as { instructions?: unknown })?.instructions === "string"
        );
        agentStore.replaceAll(validAgents);
      }

      if (!Array.isArray(parsed) && Array.isArray(parsed.categories)) {
        categoryStore.replaceAll(
          parsed.categories.filter(
            (entry: unknown) => typeof entry === "string"
          )
        );
      }

      for (const entry of entries) {
        if (typeof entry?.title === "string" && typeof entry?.content === "string") {
          if (typeof entry.category === "string") categoryStore.ensure(entry.category);
          promptStore.create({
            title: entry.title,
            content: entry.content,
            category: typeof entry.category === "string" ? entry.category : undefined,
            agentId: typeof entry.agentId === "string" ? entry.agentId : undefined,
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
        <button className="brand brand-button" onClick={onHome}>
          <span className="mark" aria-hidden="true" />
          <h1>Prompt Lab</h1>
          <span className="tagline">agent-ready prompt library</span>
        </button>

        <nav className="workspace-nav" aria-label="Workspace sections">
          <button
            className={view === "library" ? "is-active" : ""}
            onClick={() => setView("library")}
          >
            Library
          </button>
          <button
            className={view === "studio" ? "is-active" : ""}
            onClick={() => setView("studio")}
          >
            Prompt Studio
          </button>
        </nav>

        <div className="topbar-spacer" />

        <button className="btn btn-ghost topbar-file-action" onClick={exportLibrary}>
          Export
        </button>
        <button className="btn btn-ghost topbar-file-action" onClick={() => fileRef.current?.click()}>
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

        <WebMCPStatus
          ready={ready}
          supported={supported}
          toolCount={tools.length}
          remoteReady={remoteMcp.ready}
          remoteToolCount={remoteMcp.tools.length}
        />
      </header>

      {view === "studio" ? (
        <PromptStudio
          onOpenPrompt={(id) => {
            setSelectedId(id);
            setCreating(false);
            setView("library");
          }}
        />
      ) : <div className="columns">
        <PromptList
          prompts={visible}
          categories={categories}
          agents={agents}
          activeCategory={category}
          activeAgent={agentFilter}
          sort={sort}
          selectedId={selectedId}
          query={query}
          totalCount={prompts.length}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onAgentChange={setAgentFilter}
          onSortChange={setSort}
          onSelect={(id) => {
            setSelectedId(id);
            setCreating(false);
          }}
          onNew={() => setCreating(true)}
        />

        {creating ? (
          <NewPromptForm
            agents={agents}
            onCreated={(id) => {
              setSelectedId(id);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <PromptDetail
            key={selected.id}
            prompt={selected}
            agents={agents}
          />
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

        <RightRail
          activity={activity}
          tools={tools}
          onClear={clearActivity}
          agents={agents}
        />
      </div>}
    </div>
  );
}
