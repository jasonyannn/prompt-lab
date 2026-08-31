/**
 * The public catalog.
 *
 * The personal library answers "where did I put that prompt". The catalog
 * answers the earlier question — "what could I even ask?" — so it is browsable
 * by goal rather than by keyword: categories, then subcategories, then prompts,
 * with journeys stitching prompts into an ordered path from a goal to a result.
 *
 * Prompt bodies are rendered from a compact spec rather than stored as prose,
 * the same way the studio's recipes and the predictor's angles are. One
 * formatter means every catalog prompt has the same shape: role, objective,
 * the context you supply, the process, and the output it must return.
 */

import { CATALOG_CATEGORIES, CATALOG_PROMPTS, JOURNEYS } from "./catalogData";

export type PromptTier = "quick" | "workflow" | "master";

export type CatalogSubcategory = {
  id: string;
  name: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  tagline: string;
  /** Two-letter mark for the browse rail. */
  mark: string;
  subcategories: CatalogSubcategory[];
  /** Which library category these prompts default to when saved. */
  librarySuggestion: string;
};

/**
 * A role or industry version of a prompt.
 *
 * Rather than storing a separate prompt per industry, a variant layers a
 * specialised role, the evidence that field actually screens for, and a step or
 * two onto the base spec. One "Cover letter" prompt therefore covers finance,
 * kitchens, UX and everything else without duplicating the structure.
 */
export type PromptVariant = {
  id: string;
  name: string;
  /** Replaces the base spec's role. */
  role: string;
  /** One line on what this field cares about. */
  focus: string;
  /** Extra context lines, appended to the base inputs. */
  inputs: string[];
  /** Extra process steps, appended to the base steps. */
  steps: string[];
};

export type PromptVariantGroup = {
  /** Shown above the picker, e.g. "Industry or role". */
  label: string;
  options: PromptVariant[];
};

export type CatalogPromptSpec = {
  id: string;
  title: string;
  /** One line: what this does for you. */
  summary: string;
  categoryId: string;
  subcategoryId: string;
  tier: PromptTier;
  tags: string[];
  /** Filled into "Act as …". */
  role: string;
  objective: string;
  /** Labels for the context the user supplies; each becomes a placeholder. */
  inputs: string[];
  steps: string[];
  output: string[];
  /** Role or industry versions of this prompt. */
  variants?: PromptVariantGroup;
};

export type JourneyStep = {
  promptId: string;
  /** Why this step comes here. */
  note: string;
};

export type Journey = {
  id: string;
  name: string;
  /** The sentence a user would actually type. */
  goal: string;
  categoryId: string;
  /** What you have once the journey is done. */
  outcome: string;
  steps: JourneyStep[];
};

export const TIER_LABELS: Record<PromptTier, string> = {
  quick: "Quick",
  workflow: "Workflow",
  master: "Master",
};

export const TIER_BLURBS: Record<PromptTier, string> = {
  quick: "One task, one answer.",
  workflow: "Several related tasks in one pass.",
  master: "Guides an AI through a whole project.",
};

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** "What you sell" → "what you sell", usable inside {{ }}. */
export function placeholderFor(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * "an AI Engineer" but "a UI Designer" — U-initial names here read as "you",
 * so they take the consonant article despite being a vowel letter.
 */
function article(name: string) {
  return /^[aeio]/i.test(name) ? "an" : "a";
}

export function findVariant(
  spec: CatalogPromptSpec,
  variantId?: string | null
): PromptVariant | undefined {
  if (!variantId) return undefined;
  return spec.variants?.options.find((option) => option.id === variantId);
}

/** "Cover letter" → "Cover letter — UX Designer". */
export function catalogPromptTitle(
  spec: CatalogPromptSpec,
  variantId?: string | null
): string {
  const variant = findVariant(spec, variantId);
  return variant ? `${spec.title} — ${variant.name}` : spec.title;
}

/** Each variant saves as its own library prompt, so it tracks its own id. */
export function catalogSourceId(
  spec: CatalogPromptSpec,
  variantId?: string | null
): string {
  const variant = findVariant(spec, variantId);
  return variant ? `${spec.id}:${variant.id}` : spec.id;
}

/**
 * Builds the full prompt text. Context lines are left as {{placeholders}} so a
 * saved prompt drops straight into the library's variables panel.
 */
export function renderCatalogPrompt(
  spec: CatalogPromptSpec,
  variantId?: string | null
): string {
  const variant = findVariant(spec, variantId);
  const inputs = [...spec.inputs, ...(variant?.inputs ?? [])];
  const steps = [...spec.steps, ...(variant?.steps ?? [])];
  const role = variant?.role ?? spec.role;
  const specialisation = variant
    ? `\n\nSpecialisation\nThis is for ${article(variant.name)} ${variant.name} application. ${variant.focus}`
    : "";

  const context = inputs
    .map((label) => `- ${label}: {{${placeholderFor(label)}}}`)
    .join("\n");

  const closing =
    spec.tier === "master"
      ? "Work through the stages in order. Finish each one before moving to the next, and summarise what was decided before you continue."
      : "Keep the result specific to the context above and short enough to act on today.";

  return `Act as ${role}.

Objective
${spec.objective}${specialisation}

Context I am giving you
${context}

Before you begin
Ask up to 3 concise questions only if a missing detail would materially change your answer. Otherwise state your assumptions and continue. Never invent facts, figures, quotes or research — mark anything that needs checking.

${spec.tier === "master" ? "Stages" : "Process"}
${list(steps)}

Return exactly
${list(spec.output)}

${closing}`;
}

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

export function getCategories(): CatalogCategory[] {
  return CATALOG_CATEGORIES;
}

export function getCategory(id: string): CatalogCategory | undefined {
  return CATALOG_CATEGORIES.find((category) => category.id === id);
}

export function getPrompts(): CatalogPromptSpec[] {
  return CATALOG_PROMPTS;
}

export function getPrompt(id: string): CatalogPromptSpec | undefined {
  return CATALOG_PROMPTS.find((prompt) => prompt.id === id);
}

export function getJourneys(): Journey[] {
  return JOURNEYS;
}

export function getJourney(id: string): Journey | undefined {
  return JOURNEYS.find((journey) => journey.id === id);
}

export function promptsInCategory(
  categoryId: string,
  subcategoryId?: string
): CatalogPromptSpec[] {
  return CATALOG_PROMPTS.filter(
    (prompt) =>
      prompt.categoryId === categoryId &&
      (!subcategoryId || prompt.subcategoryId === subcategoryId)
  );
}

export function journeysInCategory(categoryId: string): Journey[] {
  return JOURNEYS.filter((journey) => journey.categoryId === categoryId);
}

export function journeyPrompts(journey: Journey): CatalogPromptSpec[] {
  return journey.steps
    .map((step) => getPrompt(step.promptId))
    .filter((prompt): prompt is CatalogPromptSpec => Boolean(prompt));
}

export function categoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const prompt of CATALOG_PROMPTS) {
    counts[prompt.categoryId] = (counts[prompt.categoryId] ?? 0) + 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * Goal search
 * ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "for",
  "from", "get", "help", "how", "i", "in", "is", "it", "its", "me", "my", "of",
  "on", "or", "our", "should", "so", "that", "the", "then", "this", "to", "up",
  "want", "was", "we", "what", "when", "which", "who", "will", "with", "would",
  "you", "your",
]);

function terms(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function overlap(query: string[], haystack: string) {
  const text = haystack.toLowerCase();
  let score = 0;
  for (const term of query) {
    if (text.includes(term)) score += 1;
  }
  return score;
}

export type CatalogSearchResult = {
  journeys: { journey: Journey; score: number }[];
  prompts: { prompt: CatalogPromptSpec; score: number }[];
};

/**
 * Matches a stated goal — "I want to start an online store" — against journeys
 * first, then individual prompts. A goal usually deserves a path, not a prompt.
 */
export function searchCatalog(query: string): CatalogSearchResult {
  const query_terms = terms(query);
  if (query_terms.length === 0) return { journeys: [], prompts: [] };

  const journeys = JOURNEYS.map((journey) => ({
    journey,
    // The goal line is what a user types, so it counts double.
    score:
      overlap(query_terms, journey.goal) * 2 +
      overlap(query_terms, `${journey.name} ${journey.outcome}`),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const prompts = CATALOG_PROMPTS.map((prompt) => ({
    prompt,
    score:
      overlap(query_terms, prompt.title) * 2 +
      overlap(query_terms, `${prompt.summary} ${prompt.tags.join(" ")}`),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.prompt.title.localeCompare(b.prompt.title));

  return { journeys, prompts };
}
