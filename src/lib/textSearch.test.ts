import { describe, expect, it } from "vitest";
import { createSearchIndex, parseQuery, queryWords, rankItems, stem, tokenize } from "./textSearch";
import { searchCatalog } from "./catalog";
import { searchProductRecords, type ProductRecord } from "./productSearch";

describe("tokenize", () => {
  it("drops stop words and punctuation and folds case and accents", () => {
    expect(tokenize("I want to plan a Café trip!")).toEqual(["plan", "cafe", "trip"]);
  });

  it("stems inflections of one word to the same key", () => {
    expect(stem("budgets")).toBe(stem("budget"));
    expect(stem("budgeting")).toBe(stem("budget"));
    expect(stem("companies")).toBe("company");
    expect(stem("shopping")).toBe("shop");
    expect(stem("business")).toBe("business");
  });
});

describe("createSearchIndex", () => {
  const items = [
    { title: "Cover letter", body: "A short tailored letter." },
    { title: "Start a store", body: "Launch an online shop." },
    { title: "Art direction", body: "Visual style for a brand." },
  ];
  const fields = (item: (typeof items)[number]) => [
    { text: item.title, weight: 2 },
    { text: item.body, weight: 1 },
  ];

  it("matches words in any order", () => {
    const hits = rankItems(items, "letter cover", fields);
    expect(hits[0].item.title).toBe("Cover letter");
  });

  it("does not match a term inside an unrelated word", () => {
    // "art" is a substring of "start" but not a word in it.
    const hits = rankItems(items, "art", fields).map((hit) => hit.item.title);
    expect(hits).toEqual(["Art direction"]);
  });

  it("returns nothing for a query made only of stop words", () => {
    expect(rankItems(items, "a the to", fields)).toEqual([]);
  });

  it("reaches content through a synonym", () => {
    const hits = rankItems(items, "ecommerce", fields).map((hit) => hit.item.title);
    expect(hits).toContain("Start a store");
  });

  it("ranks a literal hit above a synonym hit", () => {
    const index = createSearchIndex(
      [
        { title: "Workout plan", body: "" },
        { title: "Fitness tracker", body: "" },
      ],
      fields as never
    );
    expect(index.search("fitness")[0].item.title).toBe("Fitness tracker");
  });

  it("ranks records answering every term above those answering one", () => {
    const hits = rankItems(
      [
        { title: "Trip budget", body: "" },
        { title: "Trip packing", body: "" },
      ],
      "trip budget",
      fields as never
    );
    expect(hits[0].item.title).toBe("Trip budget");
  });

  it("enforces minCoverage", () => {
    const hits = rankItems(items, "cover store", fields, { minCoverage: 1 });
    expect(hits).toEqual([]);
  });
});

describe("queryWords", () => {
  it("includes synonyms for a broad SQL prefilter", () => {
    const words = queryWords("get fit");
    expect(words).toContain("fit");
    expect(words).toContain("workout");
    expect(parseQuery("get fit")).toHaveLength(1);
  });
});

describe("catalog goal search", () => {
  it("finds the fitness journey from everyday wording", () => {
    const result = searchCatalog("I want to get fit");
    expect(result.journeys[0]?.journey.name).toBe("Get back in shape");
  });

  it("finds budgeting prompts from an inflected word", () => {
    const titles = searchCatalog("budgeting").prompts.map((entry) => entry.prompt.title);
    expect(titles).toContain("Build a monthly budget");
  });

  it("returns nothing for stop words alone", () => {
    const result = searchCatalog("how do I");
    expect(result.journeys).toEqual([]);
    expect(result.prompts).toEqual([]);
  });
});

describe("product search with stop words", () => {
  const records: ProductRecord[] = [
    { id: "1", name: "Cover letter", description: "", category: "Career", type: "prompt", searchText: "cover letter" },
    { id: "2", name: "Trip planner", description: "", category: "Travel", type: "prompt", searchText: "trip planner" },
  ];

  it("does not let a stray article match every record", () => {
    const result = searchProductRecords({ query: "a cover letter" }, records);
    expect(result.products.map((product) => product.id)).toEqual(["1"]);
  });

  it("browses everything for a stop-word-only query", () => {
    expect(searchProductRecords({ query: "the" }, records).count).toBe(2);
  });
});

describe("search as you type", () => {
  it("matches a half-typed word by prefix", () => {
    const titles = searchCatalog("cov").prompts.map((entry) => entry.prompt.title);
    expect(titles).toContain("Cover letter");
  });
});
