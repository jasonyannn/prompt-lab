import { useEffect, useMemo, useRef, useState } from "react";
import { promptStore } from "../lib/promptStore";
import { categoryStore } from "../lib/categoryStore";
import { useCategories } from "../hooks/useCategories";
import type { PromptAgent } from "../lib/agentStore";
import type { PromptBrief } from "../lib/promptGenerator";
import {
  detectSignals,
  predictPrompts,
  type PredictedPrompt,
} from "../lib/predictivePrompts";

type Props = {
  brief: PromptBrief;
  agent: PromptAgent | null;
  onOpenPrompt: (id: string) => void;
};

const BATCH = { few: 4, many: 12 } as const;
type BatchSize = keyof typeof BATCH;

export function PredictivePrompts({ brief, agent, onOpenPrompt }: Props) {
  const { categories } = useCategories();
  const [predictions, setPredictions] = useState<PredictedPrompt[]>([]);
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [size, setSize] = useState<BatchSize>("few");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const newCategoryRef = useRef<HTMLInputElement>(null);

  const idea = brief.idea.trim();
  const signals = useMemo(() => detectSignals(brief), [brief]);

  // Predictions are read from the brief, so they go stale the moment the brief
  // changes underneath them.
  const signature = `${agent?.id ?? ""}|${idea}|${brief.templateId}`;
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    setPredictions([]);
    setSavedIds({});
    setExpandedId(null);
  }, [signature]);

  useEffect(() => {
    if (addingCategory) newCategoryRef.current?.focus();
  }, [addingCategory]);

  function predict(mode: "replace" | "more") {
    if (!agent || !idea) return;
    const next = predictPrompts({
      brief: { ...brief, idea },
      agent,
      count: BATCH[size],
      exclude: mode === "more" ? predictions.map((item) => item.localId) : [],
    });

    if (mode === "more") {
      setPredictions([...predictions, ...next]);
    } else {
      setPredictions(next);
      setSavedIds({});
      setExpandedId(null);
    }
  }

  function updatePrediction(localId: string, updates: Partial<PredictedPrompt>) {
    setPredictions((items) =>
      items.map((item) =>
        item.localId === localId ? { ...item, ...updates } : item
      )
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

  function save(item: PredictedPrompt) {
    if (!agent || savedIds[item.localId]) return;
    categoryStore.ensure(item.category);
    const prompt = promptStore.create({
      title: item.title.trim(),
      content: item.content.trim(),
      category: item.category,
      agentId: agent.id,
    });
    setSavedIds((current) => ({ ...current, [item.localId]: prompt.id }));
  }

  function saveAll() {
    if (!agent) return;
    const next = { ...savedIds };
    for (const item of predictions) {
      if (next[item.localId]) continue;
      categoryStore.ensure(item.category);
      const prompt = promptStore.create({
        title: item.title.trim(),
        content: item.content.trim(),
        category: item.category,
        agentId: agent.id,
      });
      next[item.localId] = prompt.id;
    }
    setSavedIds(next);
  }

  function createCategory() {
    const created = categoryStore.create(newCategory);
    setNewCategory("");
    setAddingCategory(false);
    return created;
  }

  if (!agent) return null;

  const unsavedCount = predictions.filter(
    (item) => !savedIds[item.localId]
  ).length;

  return (
    <section className="panel predict-panel">
      <div className="panel-head">
        <span className="step-number">3</span>
        <h2>Prompts you might ask next</h2>
        <div className="topbar-spacer" />
        <div className="predict-size" role="group" aria-label="How many prompts to predict">
          {(Object.keys(BATCH) as BatchSize[]).map((key) => (
            <button
              key={key}
              type="button"
              className={size === key ? "is-active" : ""}
              aria-pressed={size === key}
              onClick={() => setSize(key)}
            >
              {key === "few" ? "A few" : "A lot"} · {BATCH[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-body">
        <p className="predict-lede">
          The pack answers what the workflow knows you need. This reads your
          topic and predicts the follow-up prompts you are likely to want —
          save any of them straight into a category.
        </p>

        {signals.length > 0 && (
          <div className="predict-signals" aria-label="Signals read from your brief">
            <span>Reading</span>
            {signals.map((signal) => (
              <em key={signal.id}>{signal.label}</em>
            ))}
          </div>
        )}

        <div className="predict-controls">
          <button
            className="btn btn-primary"
            disabled={!idea}
            onClick={() => predict("replace")}
          >
            {predictions.length > 0 ? "Predict again" : "Predict prompts →"}
          </button>
          {predictions.length > 0 && (
            <>
              <button className="btn" onClick={() => predict("more")}>
                Predict {BATCH[size]} more
              </button>
              <button
                className="btn btn-ghost"
                disabled={unsavedCount === 0}
                onClick={saveAll}
              >
                {unsavedCount === 0
                  ? "All saved ✓"
                  : `Save all ${unsavedCount} to library`}
              </button>
              <div className="topbar-spacer" />
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPredictions([]);
                  setSavedIds({});
                  setExpandedId(null);
                }}
              >
                Clear
              </button>
            </>
          )}
        </div>

        <div className="predict-categories">
          <span className="label no-margin">Your categories</span>
          {categories.map((category) => (
            <span className="tag" key={category}>
              {category}
            </span>
          ))}
          {addingCategory ? (
            <form
              className="predict-category-form"
              onSubmit={(event) => {
                event.preventDefault();
                createCategory();
              }}
            >
              <input
                ref={newCategoryRef}
                className="input"
                aria-label="New category name"
                placeholder="e.g. Client work"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setNewCategory("");
                    setAddingCategory(false);
                  }
                }}
              />
              <button className="btn" type="submit" disabled={!newCategory.trim()}>
                Add
              </button>
            </form>
          ) : (
            <button
              className="btn btn-ghost predict-add-category"
              onClick={() => setAddingCategory(true)}
            >
              + New category
            </button>
          )}
        </div>

        {predictions.length === 0 ? (
          <p className="predict-empty">
            {idea
              ? "Nothing predicted yet. Predict a batch to see where this topic usually goes next."
              : "Describe what you are making above, and this will predict the prompts that usually come next."}
          </p>
        ) : (
          <ul className="predict-list" aria-live="polite">
            {predictions.map((item) => {
              const savedId = savedIds[item.localId];
              const expanded = expandedId === item.localId;
              return (
                <li
                  className={`predict-card${expanded ? " is-open" : ""}`}
                  key={item.localId}
                >
                  <div className="predict-card-head">
                    <span
                      className="predict-score"
                      title="How likely this follow-up is for your topic"
                    >
                      {item.confidence}%
                    </span>
                    <button
                      className="predict-title"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedId(expanded ? null : item.localId)
                      }
                    >
                      <strong title={item.title}>{item.label}</strong>
                      <small>{item.intent}</small>
                    </button>

                    <label className="predict-category-picker">
                      <span className="visually-hidden">
                        Category for {item.title}
                      </span>
                      <select
                        className="select"
                        value={item.category}
                        onChange={(event) =>
                          updatePrediction(item.localId, {
                            category: event.target.value,
                          })
                        }
                      >
                        {!categories.some(
                          (category) => category === item.category
                        ) && <option value={item.category}>{item.category}</option>}
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>

                    {savedId ? (
                      <button
                        className="btn btn-ghost saved-link"
                        onClick={() => onOpenPrompt(savedId)}
                      >
                        Saved · open →
                      </button>
                    ) : (
                      <button className="btn" onClick={() => save(item)}>
                        Save
                      </button>
                    )}
                  </div>

                  {expanded && (
                    <textarea
                      className="predict-content"
                      aria-label={`Prompt text for ${item.title}`}
                      value={item.content}
                      onChange={(event) =>
                        updatePrediction(item.localId, {
                          content: event.target.value,
                        })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
