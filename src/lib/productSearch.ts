import { parseQuery, rankItems, type SearchField } from "./textSearch";

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

function searchFields(record: ProductRecord): SearchField[] {
  return [
    { text: record.name, weight: 3 },
    { text: record.description, weight: 1.5 },
    { text: record.category, weight: 1 },
    { text: record.searchText, weight: 1 },
  ];
}

/** Shared ranked search used by the browser WebMCP and remote MCP server. */
export function searchProductRecords(
  input: ProductSearchInput,
  records: ProductRecord[]
): ProductSearchResult {
  const query = (input.query ?? "").trim();
  const category = (input.category ?? "").trim().toLowerCase();

  const requested = Number(input.limit);
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requested)))
    : DEFAULT_LIMIT;

  const candidates = records
    .filter(isPubliclyListable)
    .filter((record) =>
      category ? record.category.toLowerCase() === category : true
    );

  // A query made only of stop words ("the", "a") carries no signal, so it
  // browses like an empty query instead of matching every record by accident.
  const ranked = parseQuery(query).length
    ? rankItems(candidates, query, searchFields).map((hit) => hit.item)
    : [...candidates].sort((a, b) => a.name.localeCompare(b.name));

  const products = ranked.slice(0, limit).map(toProduct);
  return { products, count: products.length };
}
