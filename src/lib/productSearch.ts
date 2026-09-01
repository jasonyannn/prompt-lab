export type ProductType =
  | "prompt"
  | "journey"
  | "prompt_pack"
  | "agent_template";

/** The shape returned across either MCP boundary. */
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  type: ProductType;
};

/** Internal search and visibility fields that never cross an MCP boundary. */
export type ProductRecord = Product & {
  searchText: string;
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

function toProduct(record: ProductRecord): Product {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    category: record.category,
    type: record.type,
  };
}

export function isPubliclyListable(record: ProductRecord): boolean {
  return record.visibility === undefined || record.visibility === "public";
}

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

/** Shared ranked search used by the browser WebMCP and remote MCP server. */
export function searchProductRecords(
  input: ProductSearchInput,
  records: ProductRecord[]
): ProductSearchResult {
  const query = (input.query ?? "").trim().toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const category = (input.category ?? "").trim().toLowerCase();

  const requested = Number(input.limit);
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requested)))
    : DEFAULT_LIMIT;

  const matched = records
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
