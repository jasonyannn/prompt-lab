import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  collectProductRecords,
  isPubliclyListable,
  searchProducts,
  type ProductRecord,
} from "./products";
import { PROMPT_TOOLS, registerPromptTools, executeTool } from "./webmcp";

/** A small fixture so search behaviour is asserted against known data. */
const FIXTURE: ProductRecord[] = [
  {
    id: "p1",
    name: "Cover letter",
    description: "Short, specific, and clearly not a template.",
    category: "Career",
    type: "prompt",
    searchText: "cover letter short specific career applications hiring",
  },
  {
    id: "p2",
    name: "Trip budget breakdown",
    description: "What it will actually cost.",
    category: "Travel",
    type: "prompt",
    searchText: "trip budget breakdown cost travel planning",
  },
  {
    id: "j1",
    name: "Land a better job",
    description: "A target role and interview preparation.",
    category: "Career",
    type: "journey",
    searchText: "land a better job career interview resume negotiation",
  },
  {
    id: "a1",
    name: "Design Partner",
    description: "Senior product and interaction designer",
    category: "Design",
    type: "agent_template",
    searchText: "design partner senior product interaction designer",
  },
  {
    id: "secret",
    name: "My private prompt",
    description: "Should never be returned.",
    category: "Career",
    type: "prompt",
    searchText: "my private prompt career secret",
    visibility: "private",
  },
  {
    id: "unlisted",
    name: "My unlisted prompt",
    description: "Should never be returned.",
    category: "Career",
    type: "prompt",
    searchText: "my unlisted prompt career",
    visibility: "unlisted",
  },
];

const searchProductsTool = PROMPT_TOOLS.find(
  (tool) => tool.name === "search_products"
);

describe("search_products tool contract", () => {
  it("is registered with the exact required name", () => {
    expect(searchProductsTool).toBeDefined();
    expect(searchProductsTool?.name).toBe("search_products");
  });

  it("uses the exact required description", () => {
    expect(searchProductsTool?.description).toBe("Search the product catalog");
  });

  it("declares the query, category and limit input schema", () => {
    const properties = searchProductsTool?.inputSchema.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual([
      "category",
      "limit",
      "query",
    ]);
    expect(searchProductsTool?.inputSchema.required).toBeUndefined();
  });

  it("does not displace the existing Prompt Lab tools", () => {
    const names = PROMPT_TOOLS.map((tool) => tool.name);
    for (const required of [
      "search_prompts",
      "get_prompt",
      "create_prompt",
      "update_prompt",
      "delete_prompt",
      "create_agent",
      "get_agent_prompts",
      "rate_prompt",
      "record_prompt_use",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("closes every top-level input schema to unknown fields", () => {
    for (const tool of PROMPT_TOOLS) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });
});

describe("registration through document.modelContext.registerTool", () => {
  beforeEach(() => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  it("registers search_products via document.modelContext.registerTool", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool,
    };

    const controller = await registerPromptTools();
    expect(controller).not.toBeNull();

    const registered = registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registered).toContain("search_products");

    const call = registerTool.mock.calls.find(
      ([tool]) => tool.name === "search_products"
    );
    expect(call?.[0].description).toBe("Search the product catalog");
    expect(typeof call?.[0].execute).toBe("function");
  });

  it("does not crash when WebMCP is unavailable", async () => {
    expect(
      (document as unknown as { modelContext?: unknown }).modelContext
    ).toBeUndefined();
    await expect(registerPromptTools()).resolves.toBeNull();
  });

  it("reports unavailable when every browser registration fails", async () => {
    const registerTool = vi.fn().mockRejectedValue(new Error("unsupported"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool,
    };

    await expect(registerPromptTools()).resolves.toBeNull();
    consoleError.mockRestore();
  });
});

describe("search behaviour", () => {
  it("matches on keywords across name, description and tags", () => {
    const result = searchProducts({ query: "cover letter" }, FIXTURE);
    expect(result.products[0].name).toBe("Cover letter");
    expect(result.count).toBeGreaterThan(0);
  });

  it("matches text that only appears in the searchable body", () => {
    const result = searchProducts({ query: "negotiation" }, FIXTURE);
    expect(result.products.map((p) => p.id)).toContain("j1");
  });

  it("filters by category", () => {
    const result = searchProducts({ category: "Travel" }, FIXTURE);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("Trip budget breakdown");
  });

  it("treats category matching as case-insensitive", () => {
    const result = searchProducts({ category: "travel" }, FIXTURE);
    expect(result.count).toBe(1);
  });

  it("applies the limit", () => {
    const all = searchProducts({}, FIXTURE);
    expect(all.count).toBeGreaterThan(2);

    const limited = searchProducts({ limit: 2 }, FIXTURE);
    expect(limited.products).toHaveLength(2);
    expect(limited.count).toBe(2);
  });

  it("clamps a limit above the maximum and below one", () => {
    expect(searchProducts({ limit: 9999 }, FIXTURE).count).toBeLessThanOrEqual(50);
    expect(searchProducts({ limit: 0 }, FIXTURE).count).toBe(1);
  });

  it("returns zero results for a query that matches nothing", () => {
    const result = searchProducts({ query: "zzzznotathing" }, FIXTURE);
    expect(result.products).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns the product shape and nothing internal", () => {
    const [product] = searchProducts({ query: "cover" }, FIXTURE).products;
    expect(Object.keys(product).sort()).toEqual([
      "category",
      "description",
      "id",
      "name",
      "type",
    ]);
  });
});

describe("privacy boundaries", () => {
  it("never returns private resources", () => {
    const result = searchProducts({ query: "private" }, FIXTURE);
    expect(result.products.map((p) => p.id)).not.toContain("secret");
    expect(result.count).toBe(0);
  });

  it("never returns unlisted resources, even when filtered by their category", () => {
    const result = searchProducts({ category: "Career" }, FIXTURE);
    const ids = result.products.map((p) => p.id);
    expect(ids).not.toContain("secret");
    expect(ids).not.toContain("unlisted");
    expect(ids).toContain("p1");
  });

  it("gates listability on visibility", () => {
    expect(isPubliclyListable(FIXTURE[0])).toBe(true);
    expect(isPubliclyListable(FIXTURE[4])).toBe(false);
    expect(isPubliclyListable(FIXTURE[5])).toBe(false);
  });

  it("emits no non-public records from the app's real data", () => {
    for (const record of collectProductRecords()) {
      expect(isPubliclyListable(record)).toBe(true);
    }
  });
});

describe("end to end through executeTool", () => {
  it("lists prompts owned by a requested agent", async () => {
    localStorage.clear();
    const result = await executeTool("get_agent_prompts", {
      agent_id: "design-partner",
    });
    const text = result.content.find((part) => part.type === "text");
    const payload = JSON.parse((text as { type: "text"; text: string }).text);

    expect(result.isError).toBeFalsy();
    expect(payload.agent.id).toBe("design-partner");
    expect(payload.prompts.map((prompt: { id: string }) => prompt.id)).toContain(
      "ux-audit"
    );
  });

  it("searches the app's real catalog and returns the product shape", async () => {
    const result = await executeTool("search_products", {
      query: "cover letter",
      limit: 3,
    });

    expect(result.isError).toBeFalsy();
    const text = result.content.find((part) => part.type === "text");
    expect(text).toBeDefined();

    const payload = JSON.parse(
      (text as { type: "text"; text: string }).text
    ) as { products: { name: string; type: string }[]; count: number };

    expect(payload.count).toBeGreaterThan(0);
    expect(payload.products.length).toBeLessThanOrEqual(3);
    expect(payload.products[0]).toHaveProperty("name");
    expect(payload.products[0]).toHaveProperty("type");
  });

  it("returns an empty result set rather than failing on no matches", async () => {
    const result = await executeTool("search_products", {
      query: "zzzznotathing",
    });
    const text = result.content.find((part) => part.type === "text");
    const payload = JSON.parse((text as { type: "text"; text: string }).text);
    expect(payload.count).toBe(0);
    expect(payload.products).toEqual([]);
  });
});
