/**
 * The "product" abstraction.
 *
 * The WebMCP Challenge asks every entrant to expose a `search_products` tool
 * over a "product catalog". Prompt Lab does not sell anything, so "product"
 * here means a *reusable Prompt Lab resource*: a catalog prompt, a journey, a
 * prompt pack workflow, or an agent template.
 *
 * This mapping exists only at the WebMCP boundary. Nothing in the UI, the
 * stores or the database is renamed — `Product` is produced on demand from the
 * real data the app already holds, and is never persisted.
 *
 * Privacy: `collectProductRecords` only ever emits resources the current
 * browser is entitled to see. Anything carrying a non-public visibility flag is
 * dropped by `isPubliclyListable` before it can reach a caller.
 */

import { getJourneys, getPrompts as getCatalogPrompts, getCategory } from "./catalog";
import { PROMPT_TEMPLATES } from "./promptGenerator";
import { promptStore } from "./promptStore";
import { agentStore } from "./agentStore";

export type ProductType = "prompt" | "journey" | "prompt_pack" | "agent_template";

/** The shape returned across the WebMCP boundary. */
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  type: ProductType;
};

/**
 * A product plus the fields used for matching and access control. Never
 * returned to a caller — `toProduct` strips it back to the public shape.
 */
export type ProductRecord = Product & {
  /** name + description + category + tags + content, lowercased. */
  searchText: string;
  /** Anything not publicly listable, e.g. a private forum post. */
  visibility?: "public" | "unlisted" | "private";
};

export type ProductSearchInput = {
  query?: string;
  category?: string;
  limit?: number;
};

export type ProductSearchResult = {
  products: Product[];
  count: number;
};

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

function searchable(parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function toProduct(record: ProductRecord): Product {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    category: record.category,
    type: record.type,
  };
}

/**
 * The access-control gate. A resource is listable only when it carries no
 * visibility flag (public by construction, like the catalog) or is explicitly
 * public. Private and unlisted resources never leave this module.
 */
export function isPubliclyListable(record: ProductRecord): boolean {
  return record.visibility === undefined || record.visibility === "public";
}

/* ------------------------------------------------------------------ *
 * Building records from the app's real data
 * ------------------------------------------------------------------ */

/** Catalog prompts, journeys, prompt packs and agent templates. */
export function collectCatalogRecords(): ProductRecord[] {
  const records: ProductRecord[] = [];

  for (const spec of getCatalogPrompts()) {
    const categoryName = getCategory(spec.categoryId)?.name ?? spec.categoryId;
    records.push({
      id: spec.id,
      name: spec.title,
      description: spec.summary,
      category: categoryName,
      type: "prompt",
      searchText: searchable([
        spec.title,
        spec.summary,
        categoryName,
        spec.subcategoryId,
        spec.tier,
        spec.tags.join(" "),
        spec.objective,
        spec.role,
      ]),
    });
  }

  for (const journey of getJourneys()) {
    const categoryName = getCategory(journey.categoryId)?.name ?? journey.categoryId;
    records.push({
      id: journey.id,
      name: journey.name,
      description: journey.outcome,
      category: categoryName,
      type: "journey",
      searchText: searchable([
        journey.name,
        journey.outcome,
        journey.goal,
        categoryName,
        journey.steps.map((step) => step.note).join(" "),
      ]),
    });
  }

  for (const template of PROMPT_TEMPLATES) {
    records.push({
      id: `pack-${template.id}`,
      name: template.name,
      description: template.description,
      category: "Prompt pack",
      type: "prompt_pack",
      searchText: searchable([
        template.name,
        template.description,
        template.eyebrow,
        "prompt pack workflow",
      ]),
    });
  }

  return records;
}

/**
 * The signed-in browser's own resources: saved prompts and agent templates.
 * These live in this browser's storage, so they belong to whoever is using it.
 */
export function collectLocalRecords(): ProductRecord[] {
  const records: ProductRecord[] = [];

  for (const prompt of promptStore.getAll()) {
    records.push({
      id: prompt.id,
      name: prompt.title,
      description: prompt.content.split("\n")[0].slice(0, 160),
      category: prompt.category,
      type: "prompt",
      searchText: searchable([
        prompt.title,
        prompt.category,
        // Prompt bodies are searched too — this is the text people remember.
        prompt.content,
      ]),
    });
  }

  for (const agent of agentStore.getAll()) {
    records.push({
      id: agent.id,
      name: agent.name,
      description: agent.role,
      category: agent.defaultCategory,
      type: "agent_template",
      searchText: searchable([
        agent.name,
        agent.role,
        agent.instructions,
        agent.defaultCategory,
      ]),
    });
  }

  return records;
}

/** Everything this browser may list, deduplicated by type and id. */
export function collectProductRecords(): ProductRecord[] {
  const all = [...collectCatalogRecords(), ...collectLocalRecords()];
  const seen = new Set<string>();

  return all.filter((record) => {
    if (!isPubliclyListable(record)) return false;
    const key = `${record.type}:${record.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

function score(record: ProductRecord, terms: string[]): number {
  if (terms.length === 0) return 1;
  const name = record.name.toLowerCase();

  let total = 0;
  for (const term of terms) {
    if (name.includes(term)) total += 3;
    else if (record.searchText.includes(term)) total += 1;
  }
  return total;
}

/**
 * Searches Prompt Lab resources. `records` is injectable so the behaviour can
 * be tested without a browser; it defaults to the app's real data.
 */
export function searchProducts(
  input: ProductSearchInput = {},
  records: ProductRecord[] = collectProductRecords()
): ProductSearchResult {
  const query = (input.query ?? "").trim().toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const category = (input.category ?? "").trim().toLowerCase();

  const requested = Number(input.limit);
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requested)))
    : DEFAULT_LIMIT;

  const matched = records
    // Defence in depth: filter again, even though collect already did.
    .filter(isPubliclyListable)
    .filter((record) =>
      category ? record.category.toLowerCase() === category : true
    )
    .map((record) => ({ record, weight: score(record, terms) }))
    .filter((entry) => entry.weight > 0)
    .sort(
      (a, b) =>
        b.weight - a.weight || a.record.name.localeCompare(b.record.name)
    );

  const products = matched.slice(0, limit).map((entry) => toProduct(entry.record));
  return { products, count: products.length };
}
