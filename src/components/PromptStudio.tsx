import { useMemo, useState } from "react";
import { useAgents } from "../hooks/useAgents";
import { usePrompts } from "../hooks/usePrompts";
import { promptStore } from "../lib/promptStore";
import {
  generatePromptPack,
  PROMPT_TEMPLATES,
  type GeneratedPrompt,
  type PromptBrief,
} from "../lib/promptGenerator";
import { attachmentContext, type UserAttachment } from "../lib/attachments";
import { AttachmentPicker } from "./AttachmentPicker";
import { AgentManager } from "./AgentManager";
import { KnowledgeLibrary } from "./KnowledgeLibrary";
import { PredictivePrompts } from "./PredictivePrompts";

type Props = {
  onOpenPrompt: (id: string) => void;
};

const EXAMPLES = [
  "A Snip design AI app",
  "A meal planner for busy families",
  "A launch campaign for my portfolio",
];

const EMPTY_BRIEF: PromptBrief = {
  idea: "",
  audience: "",
  platform: "",
  sourceData: "",
  constraints: "",
  templateId: "app",
};

export function PromptStudio({ onOpenPrompt }: Props) {
  const { agents } = useAgents();
  const { prompts } = usePrompts();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    () => agents[0]?.id ?? null
  );
  const [brief, setBrief] = useState<PromptBrief>(EMPTY_BRIEF);
  const [attachments, setAttachments] = useState<UserAttachment[]>([]);
  const [generated, setGenerated] = useState<GeneratedPrompt[]>([]);
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const imageCount = attachments.filter(
    (attachment) => attachment.kind === "image"
  ).length;

  const promptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const prompt of prompts) {
      if (prompt.agentId) counts[prompt.agentId] = (counts[prompt.agentId] ?? 0) + 1;
    }
    return counts;
  }, [prompts]);

  function generate() {
    if (
      !brief.idea.trim() ||
      !selectedAgent ||
      (brief.templateId === "screenshot" && imageCount === 0)
    ) return;
    setGenerated(
      generatePromptPack(
        {
          ...brief,
          idea: brief.idea.trim(),
          sourceMaterial: attachmentContext(attachments, 12_000),
        },
        selectedAgent
      )
    );
    setSavedIds({});
  }

  function selectAgent(id: string) {
    setSelectedAgentId(id);
    setAttachments([]);
    setGenerated([]);
    setSavedIds({});
  }

  function updateGenerated(localId: string, updates: Partial<GeneratedPrompt>) {
    setGenerated((items) =>
      items.map((item) => (item.localId === localId ? { ...item, ...updates } : item))
    );
    const savedId = savedIds[localId];
    if (savedId) {
      promptStore.update(savedId, {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.category !== undefined ? { category: updates.category } : {}),
      });
    }
  }

  function saveOne(item: GeneratedPrompt) {
    if (!selectedAgent || !item.title.trim() || !item.content.trim()) return;
    const prompt = promptStore.create({
      title: item.title.trim(),
      content: item.content.trim(),
      category: item.category,
      agentId: selectedAgent.id,
    });
    setSavedIds((current) => ({ ...current, [item.localId]: prompt.id }));
  }

  function saveAll() {
    if (!selectedAgent) return;
    const next = { ...savedIds };
    for (const item of generated) {
      if (next[item.localId] || !item.title.trim() || !item.content.trim()) continue;
      const prompt = promptStore.create({
        title: item.title.trim(),
        content: item.content.trim(),
        category: item.category,
        agentId: selectedAgent.id,
      });
      next[item.localId] = prompt.id;
    }
    setSavedIds(next);
  }

  const canGenerate =
    brief.idea.trim() !== "" &&
    selectedAgent !== null &&
    (brief.templateId !== "screenshot" || imageCount > 0);
  const allSaved = generated.length > 0 && generated.every((item) => savedIds[item.localId]);
  const hasInvalidPrompt = generated.some(
    (item) => !item.title.trim() || !item.content.trim()
  );

  return (
    <div className="studio-layout">
      <AgentManager
        agents={agents}
        selectedId={selectedAgent?.id ?? null}
        promptCounts={promptCounts}
        onSelect={selectAgent}
      />

      <main className="studio-main">
        <section className="studio-hero">
          <span className="eyebrow studio-eyebrow">Prompt Studio</span>
          <h2>Start with the idea.<br /><em>Leave with the prompts.</em></h2>
          <p>
            Tell your agent what you are trying to make. A short guided brief turns it
            into a practical prompt pack you can edit, save and use in any AI tool.
          </p>
          {selectedAgent && (
            <div className="active-agent-strip">
              <span className="agent-avatar" aria-hidden="true">
                {selectedAgent.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <small>Building with</small>
                <strong>{selectedAgent.name}</strong>
              </span>
              <span className="active-agent-role">{selectedAgent.role}</span>
            </div>
          )}
        </section>

        <section className="panel brief-panel">
          <div className="panel-head">
            <span className="step-number">1</span>
            <h2>Choose a starting point</h2>
          </div>
          <div className="panel-body">
            <div className="template-grid">
              {PROMPT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className={`template-card${brief.templateId === template.id ? " is-active" : ""}`}
                  aria-pressed={brief.templateId === template.id}
                  onClick={() =>
                    setBrief({ ...brief, templateId: template.id })
                  }
                >
                  <small>{template.eyebrow}</small>
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                  {template.requiresImage && <em>Image required</em>}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel brief-panel">
          <div className="panel-head">
            <span className="step-number">2</span>
            <h2>Give it a useful brief</h2>
            <div className="topbar-spacer" />
            <span className="hint no-margin">
              {brief.templateId === "screenshot"
                ? "An idea and screenshot are required"
                : "Only the idea is required"}
            </span>
          </div>
          <div className="panel-body">
            <div className="field">
              <label className="label" htmlFor="brief-idea">What are you trying to create?</label>
              <textarea
                id="brief-idea"
                className="textarea brief-idea"
                placeholder="e.g. I want to create a Snip design AI app that turns screenshots into editable interface ideas…"
                value={brief.idea}
                onChange={(event) => setBrief({ ...brief, idea: event.target.value })}
              />
              {!brief.idea && (
                <div className="example-row">
                  {EXAMPLES.map((example) => (
                    <button key={example} className="example-chip" onClick={() => setBrief({ ...brief, idea: example })}>
                      {example}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="brief-grid">
              <div className="field">
                <label className="label" htmlFor="brief-audience">Who is it for?</label>
                <input
                  id="brief-audience"
                  className="input"
                  placeholder="Freelance product designers"
                  value={brief.audience}
                  onChange={(event) => setBrief({ ...brief, audience: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="brief-platform">Where will you use the prompts?</label>
                <input
                  id="brief-platform"
                  className="input"
                  placeholder="Cursor, Lovable, ChatGPT, Figma…"
                  value={brief.platform}
                  onChange={(event) => setBrief({ ...brief, platform: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="brief-data">What can you give the AI?</label>
                <input
                  id="brief-data"
                  className="input"
                  placeholder="Screenshots, brand guide, user notes…"
                  value={brief.sourceData}
                  onChange={(event) => setBrief({ ...brief, sourceData: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="brief-constraints">Any constraints?</label>
                <input
                  id="brief-constraints"
                  className="input"
                  placeholder="Mobile first, one-week MVP, no backend…"
                  value={brief.constraints}
                  onChange={(event) => setBrief({ ...brief, constraints: event.target.value })}
                />
              </div>
            </div>

            <div className="field studio-attachments">
              <div className="attachment-label-row">
                <label className="label">Reference files</label>
                <span className="hint no-margin">Processed only in this browser</span>
              </div>
              <AttachmentPicker
                attachments={attachments}
                onChange={setAttachments}
              />
              {brief.templateId === "screenshot" && imageCount === 0 && (
                <p className="screenshot-needed" role="status">
                  Attach a screenshot to generate the visual workflow.
                </p>
              )}
              <p className="hint">
                Document text is embedded into generated prompts. A WebMCP agent can
                inspect both documents and images; Local Agent image analysis requires
                a vision-capable model.
              </p>
              <KnowledgeLibrary
                agent={selectedAgent ?? undefined}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>

            <div className="generate-row">
              <div>
                <strong>Generate 4 connected prompts</strong>
                <span>Each one includes context, inputs, process and a required output.</span>
              </div>
              <button className="btn btn-primary btn-generate" disabled={!canGenerate} onClick={generate}>
                Generate prompt pack →
              </button>
            </div>
          </div>
        </section>

        {generated.length > 0 && (
          <section className="generated-section" aria-live="polite">
            <div className="generated-head">
              <div>
                <span className="eyebrow studio-eyebrow">Your prompt pack</span>
                <h2>{generated.length} prompts, ready to make your own.</h2>
              </div>
              <button
                className="btn btn-primary"
                disabled={allSaved || hasInvalidPrompt}
                onClick={saveAll}
              >
                {allSaved ? "Saved to library ✓" : "Save all to library"}
              </button>
            </div>

            <div className="generated-grid">
              {generated.map((item, index) => {
                const savedId = savedIds[item.localId];
                return (
                  <article className="generated-card" key={item.localId}>
                    <div className="generated-card-head">
                      <span className="generated-index">0{index + 1}</span>
                      <input
                        className="generated-title"
                        value={item.title}
                        aria-label={`Title for prompt ${index + 1}`}
                        onChange={(event) =>
                          updateGenerated(item.localId, { title: event.target.value })
                        }
                      />
                      <span className="tag">{item.category}</span>
                    </div>
                    <textarea
                      className="generated-content"
                      value={item.content}
                      aria-label={`Content for ${item.title}`}
                      onChange={(event) =>
                        updateGenerated(item.localId, { content: event.target.value })
                      }
                    />
                    <div className="generated-actions">
                      <span className="hint no-margin">
                        {savedId ? "Saved changes sync automatically" : "Editable before saving"}
                      </span>
                      <div className="topbar-spacer" />
                      {savedId ? (
                        <button className="btn btn-ghost saved-link" onClick={() => onOpenPrompt(savedId)}>
                          Saved · open →
                        </button>
                      ) : (
                        <button
                          className="btn"
                          disabled={!item.title.trim() || !item.content.trim()}
                          onClick={() => saveOne(item)}
                        >
                          Save prompt
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <PredictivePrompts
          brief={brief}
          agent={selectedAgent}
          onOpenPrompt={onOpenPrompt}
        />
      </main>
    </div>
  );
}
