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

import { promptStore } from "./promptStore";
import { agentStore } from "./agentStore";
import { collectCatalogRecords } from "./catalogProducts";
import {
  isPubliclyListable,
  searchProductRecords,
  type ProductRecord,
  type ProductSearchInput,
  type ProductSearchResult,
} from "./productSearch";

export { collectCatalogRecords } from "./catalogProducts";
export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  isPubliclyListable,
  type Product,
  type ProductRecord,
  type ProductSearchInput,
  type ProductSearchResult,
  type ProductType,
} from "./productSearch";

function searchable(parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Building records from the app's real data
 * ------------------------------------------------------------------ */

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

/**
 * Searches Prompt Lab resources. `records` is injectable so the behaviour can
 * be tested without a browser; it defaults to the app's real data.
 */
export function searchProducts(
  input: ProductSearchInput = {},
  records: ProductRecord[] = collectProductRecords()
): ProductSearchResult {
  return searchProductRecords(input, records);
}
