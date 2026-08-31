import { useMemo, useState } from "react";
import { usePrompts } from "../hooks/usePrompts";
import { useCategories } from "../hooks/useCategories";
import { promptStore } from "../lib/promptStore";
import { categoryStore } from "../lib/categoryStore";
import { extractVariables } from "../lib/variables";
import {
  catalogPromptTitle,
  catalogSourceId,
  findVariant,
  getCategories,
  getCategory,
  getJourney,
  getJourneys,
  getPrompt,
  journeyPrompts,
  journeysInCategory,
  promptsInCategory,
  renderCatalogPrompt,
  searchCatalog,
  TIER_BLURBS,
  TIER_LABELS,
  categoryCounts,
  type CatalogPromptSpec,
  type Journey,
  type PromptTier,
} from "../lib/catalog";

type Props = {
  onOpenPrompt: (id: string) => void;
};

const EXAMPLE_GOALS = [
  "I want to start an online store",
  "I have an app idea",
  "I want a better job",
  "I can't get on top of my week",
];

const TIERS: PromptTier[] = ["quick", "workflow", "master"];

export function Discover({ onOpenPrompt }: Props) {
  const { prompts } = usePrompts();
  const { categories: libraryCategories } = useCategories();

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [tier, setTier] = useState<PromptTier | "all">("all");
  const [openPromptId, setOpenPromptId] = useState<string | null>(null);
  const [openJourneyId, setOpenJourneyId] = useState<string | null>(null);
  const [saveCategory, setSaveCategory] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);

  const catalogCategories = getCategories();
  const counts = useMemo(() => categoryCounts(), []);

  /** Catalog id → library prompt id, so the catalog knows what you already have. */
  const savedBySource = useMemo(() => {
    const map: Record<string, string> = {};
    for (const prompt of prompts) {
      if (prompt.sourceId) map[prompt.sourceId] = prompt.id;
    }
    return map;
  }, [prompts]);

  const results = useMemo(
    () => (query.trim() ? searchCatalog(query) : null),
    [query]
  );

  const activeCategory = categoryId ? getCategory(categoryId) : undefined;
  const openPrompt = openPromptId ? getPrompt(openPromptId) : undefined;
  const openJourney = openJourneyId ? getJourney(openJourneyId) : undefined;

  function suggestionFor(spec: CatalogPromptSpec) {
    return getCategory(spec.categoryId)?.librarySuggestion ?? "General";
  }

  function save(
    spec: CatalogPromptSpec,
    category: string,
    variant?: string | null
  ) {
    categoryStore.ensure(category);
    return promptStore.create({
      title: catalogPromptTitle(spec, variant),
      content: renderCatalogPrompt(spec, variant),
      category,
      sourceId: catalogSourceId(spec, variant),
    });
  }

  function saveJourney(journey: Journey, category: string) {
    // Saved in reverse so step one ends up at the top of a recency-sorted list.
    const specs = journeyPrompts(journey).filter(
      (spec) => !savedBySource[spec.id]
    );
    for (const spec of [...specs].reverse()) save(spec, category);
  }

  function openCategory(id: string) {
    setCategoryId(id);
    setSubcategoryId(null);
    setTier("all");
    setQuery("");
    setOpenPromptId(null);
    setOpenJourneyId(null);
  }

  function showPrompt(spec: CatalogPromptSpec) {
    setOpenPromptId(spec.id);
    setOpenJourneyId(null);
    setVariantId(null);
    setSaveCategory(suggestionFor(spec));
  }

  function showJourney(journey: Journey) {
    setOpenJourneyId(journey.id);
    setOpenPromptId(null);
    setSaveCategory(
      getCategory(journey.categoryId)?.librarySuggestion ?? "General"
    );
  }

  const listedPrompts = useMemo(() => {
    const base = activeCategory
      ? promptsInCategory(activeCategory.id, subcategoryId ?? undefined)
      : [];
    return tier === "all" ? base : base.filter((spec) => spec.tier === tier);
  }, [activeCategory, subcategoryId, tier]);

  function renderPromptCard(spec: CatalogPromptSpec) {
    const savedId = savedBySource[spec.id];
    return (
      <article
        className={`catalog-card${openPromptId === spec.id ? " is-open" : ""}`}
        key={spec.id}
      >
        <button className="catalog-card-main" onClick={() => showPrompt(spec)}>
          <span className={`tier-badge tier-${spec.tier}`}>
            {TIER_LABELS[spec.tier]}
          </span>
          <strong>{spec.title}</strong>
          <span>{spec.summary}</span>
          {spec.variants && (
            <em className="variant-hint">
              {spec.variants.options.length} role versions
            </em>
          )}
        </button>
        <div className="catalog-card-foot">
          <small>{getCategory(spec.categoryId)?.name}</small>
          <div className="topbar-spacer" />
          {savedId ? (
            <button
              className="btn btn-ghost saved-link"
              onClick={() => onOpenPrompt(savedId)}
            >
              In library · open →
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => save(spec, suggestionFor(spec))}
            >
              Save
            </button>
          )}
        </div>
      </article>
    );
  }

  function renderJourneyCard(journey: Journey) {
    const steps = journeyPrompts(journey);
    const savedCount = steps.filter((spec) => savedBySource[spec.id]).length;
    return (
      <article className="journey-card" key={journey.id}>
        <button className="journey-card-main" onClick={() => showJourney(journey)}>
          <span className="eyebrow">Journey · {steps.length} prompts</span>
          <strong>{journey.name}</strong>
          <span className="journey-goal">“{journey.goal}”</span>
          <span className="journey-outcome">{journey.outcome}</span>
        </button>
        <div className="journey-card-foot">
          <small>
            {savedCount > 0
              ? `${savedCount} of ${steps.length} already in your library`
              : getCategory(journey.categoryId)?.name}
          </small>
          <div className="topbar-spacer" />
          <button className="btn" onClick={() => showJourney(journey)}>
            Open journey →
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="discover-layout">
      <aside className="panel catalog-rail">
        <div className="panel-head">
          <h2>Browse</h2>
        </div>
        <div className="catalog-rail-body">
          <button
            className={`catalog-cat${categoryId === null ? " is-active" : ""}`}
            onClick={() => {
              setCategoryId(null);
              setSubcategoryId(null);
              setOpenPromptId(null);
              setOpenJourneyId(null);
            }}
          >
            <span className="catalog-mark" aria-hidden="true">
              ★
            </span>
            <span className="catalog-cat-copy">
              <strong>Everything</strong>
              <small>Journeys and popular prompts</small>
            </span>
          </button>

          {catalogCategories.map((category) => (
            <div key={category.id}>
              <button
                className={`catalog-cat${categoryId === category.id ? " is-active" : ""}`}
                onClick={() => openCategory(category.id)}
              >
                <span className="catalog-mark" aria-hidden="true">
                  {category.mark}
                </span>
                <span className="catalog-cat-copy">
                  <strong>{category.name}</strong>
                  <small>{counts[category.id] ?? 0} prompts</small>
                </span>
              </button>

              {categoryId === category.id && (
                <div className="catalog-subs">
                  <button
                    className={subcategoryId === null ? "is-active" : ""}
                    onClick={() => setSubcategoryId(null)}
                  >
                    All
                  </button>
                  {category.subcategories.map((sub) => (
                    <button
                      key={sub.id}
                      className={subcategoryId === sub.id ? "is-active" : ""}
                      onClick={() => setSubcategoryId(sub.id)}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="discover-main">
        <section className="discover-hero">
          <span className="eyebrow studio-eyebrow">Discover</span>
          <h2>
            Start with the goal.<br />
            <em>We'll show you what to ask.</em>
          </h2>
          <div className="goal-search">
            <input
              className="input"
              aria-label="What are you trying to do?"
              placeholder="What are you trying to do? e.g. I want to start an online store"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpenPromptId(null);
                setOpenJourneyId(null);
              }}
            />
            {query && (
              <button className="btn btn-ghost" onClick={() => setQuery("")}>
                Clear
              </button>
            )}
          </div>
          {!query && (
            <div className="example-row">
              {EXAMPLE_GOALS.map((goal) => (
                <button
                  key={goal}
                  className="example-chip"
                  onClick={() => setQuery(goal)}
                >
                  {goal}
                </button>
              ))}
            </div>
          )}
        </section>

        {openJourney ? (
          <section className="panel journey-detail">
            <div className="panel-head">
              <button className="btn btn-ghost" onClick={() => setOpenJourneyId(null)}>
                ← Back
              </button>
              <div className="topbar-spacer" />
              <label className="save-into">
                <span>Save into</span>
                <select
                  className="select"
                  value={saveCategory ?? ""}
                  onChange={(event) => setSaveCategory(event.target.value)}
                >
                  {libraryCategories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-primary"
                onClick={() =>
                  saveJourney(openJourney, saveCategory ?? "General")
                }
              >
                Save all to library
              </button>
            </div>

            <div className="panel-body">
              <span className="eyebrow">
                Journey · {openJourney.steps.length} prompts
              </span>
              <h3 className="journey-title">{openJourney.name}</h3>
              <p className="journey-goal">“{openJourney.goal}”</p>
              <p className="journey-outcome">
                <strong>You end up with:</strong> {openJourney.outcome}
              </p>

              <ol className="journey-steps">
                {openJourney.steps.map((step, index) => {
                  const spec = getPrompt(step.promptId);
                  if (!spec) return null;
                  const savedId = savedBySource[spec.id];
                  return (
                    <li key={step.promptId}>
                      <span className="journey-step-index">{index + 1}</span>
                      <span className="journey-step-copy">
                        <button
                          className="journey-step-title"
                          onClick={() => showPrompt(spec)}
                        >
                          {spec.title}
                        </button>
                        <small>{step.note}</small>
                      </span>
                      <span className={`tier-badge tier-${spec.tier}`}>
                        {TIER_LABELS[spec.tier]}
                      </span>
                      {savedId ? (
                        <button
                          className="btn btn-ghost saved-link"
                          onClick={() => onOpenPrompt(savedId)}
                        >
                          Saved →
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() => save(spec, saveCategory ?? "General")}
                        >
                          Save
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        ) : openPrompt ? (
          <section className="panel catalog-detail">
            <div className="panel-head">
              <button className="btn btn-ghost" onClick={() => setOpenPromptId(null)}>
                ← Back
              </button>
              <div className="topbar-spacer" />
              <label className="save-into">
                <span>Save into</span>
                <select
                  className="select"
                  value={saveCategory ?? ""}
                  onChange={(event) => setSaveCategory(event.target.value)}
                >
                  {libraryCategories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {savedBySource[catalogSourceId(openPrompt, variantId)] ? (
                <button
                  className="btn btn-ghost saved-link"
                  onClick={() =>
                    onOpenPrompt(savedBySource[catalogSourceId(openPrompt, variantId)])
                  }
                >
                  In library · open →
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    save(openPrompt, saveCategory ?? "General", variantId)
                  }
                >
                  Save{variantId ? " this version" : " to library"}
                </button>
              )}
            </div>

            <div className="panel-body">
              <span className={`tier-badge tier-${openPrompt.tier}`}>
                {TIER_LABELS[openPrompt.tier]}
              </span>
              <h3 className="catalog-detail-title">
                {catalogPromptTitle(openPrompt, variantId)}
              </h3>
              <p className="catalog-detail-summary">{openPrompt.summary}</p>

              {openPrompt.variants && (
                <div className="variant-picker">
                  <span className="label no-margin">
                    {openPrompt.variants.label}
                  </span>
                  <div className="variant-options">
                    <button
                      className={`variant-chip${variantId === null ? " is-active" : ""}`}
                      aria-pressed={variantId === null}
                      onClick={() => setVariantId(null)}
                    >
                      General
                    </button>
                    {openPrompt.variants.options.map((option) => {
                      const savedHere =
                        savedBySource[catalogSourceId(openPrompt, option.id)];
                      return (
                        <button
                          key={option.id}
                          className={`variant-chip${variantId === option.id ? " is-active" : ""}${savedHere ? " is-saved" : ""}`}
                          aria-pressed={variantId === option.id}
                          title={savedHere ? "Already in your library" : option.focus}
                          onClick={() => setVariantId(option.id)}
                        >
                          {option.name}
                          {savedHere && <span aria-hidden="true"> ✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {findVariant(openPrompt, variantId) && (
                    <p className="variant-focus">
                      {findVariant(openPrompt, variantId)?.focus}
                    </p>
                  )}
                </div>
              )}

              <p className="hint">
                {TIER_BLURBS[openPrompt.tier]} Fill the{" "}
                {
                  extractVariables(renderCatalogPrompt(openPrompt, variantId))
                    .length
                }{" "}
                placeholders once it's in your library and it becomes your own
                version.
              </p>
              <pre className="catalog-prompt-text">
                {renderCatalogPrompt(openPrompt, variantId)}
              </pre>
            </div>
          </section>
        ) : results ? (
          <section className="discover-results">
            {results.journeys.length === 0 && results.prompts.length === 0 ? (
              <p className="predict-empty">
                Nothing matched that. Try describing the outcome you want, or
                browse a category on the left.
              </p>
            ) : (
              <>
                {results.journeys.length > 0 && (
                  <>
                    <div className="discover-head">
                      <h3>Recommended journey</h3>
                      <span className="hint no-margin">
                        A goal usually needs a path, not one prompt.
                      </span>
                    </div>
                    <div className="journey-grid">
                      {results.journeys
                        .slice(0, 3)
                        .map((entry) => renderJourneyCard(entry.journey))}
                    </div>
                  </>
                )}
                {results.prompts.length > 0 && (
                  <>
                    <div className="discover-head">
                      <h3>Matching prompts</h3>
                      <span className="hint no-margin">
                        {results.prompts.length} found
                      </span>
                    </div>
                    <div className="catalog-grid">
                      {results.prompts
                        .slice(0, 12)
                        .map((entry) => renderPromptCard(entry.prompt))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        ) : activeCategory ? (
          <section className="discover-results">
            <div className="discover-head">
              <h3>{activeCategory.name}</h3>
              <span className="hint no-margin">{activeCategory.tagline}</span>
            </div>

            {journeysInCategory(activeCategory.id).length > 0 && (
              <div className="journey-grid">
                {journeysInCategory(activeCategory.id).map(renderJourneyCard)}
              </div>
            )}

            <div className="tier-filter" role="group" aria-label="Filter by prompt type">
              <button
                className={tier === "all" ? "is-active" : ""}
                onClick={() => setTier("all")}
              >
                All
              </button>
              {TIERS.map((value) => (
                <button
                  key={value}
                  className={tier === value ? "is-active" : ""}
                  title={TIER_BLURBS[value]}
                  onClick={() => setTier(value)}
                >
                  {TIER_LABELS[value]}
                </button>
              ))}
            </div>

            <div className="catalog-grid">
              {listedPrompts.map(renderPromptCard)}
            </div>
          </section>
        ) : (
          <section className="discover-results">
            <div className="discover-head">
              <h3>Journeys</h3>
              <span className="hint no-margin">
                A goal, broken into the prompts that get you there.
              </span>
            </div>
            <div className="journey-grid">
              {getJourneys().map(renderJourneyCard)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
