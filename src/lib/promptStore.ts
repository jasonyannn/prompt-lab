export type Prompt = {
  id: string;
  title: string;
  content: string;
  category: string;
  rating?: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "promptlab_prompts";

const starterPrompts: Prompt[] = [
  {
    id: "ux-audit",
    title: "Senior UX Audit",
    category: "Design",
    content: `Act as a senior product designer and UX researcher.

Audit the provided interface for:
- usability
- information hierarchy
- accessibility
- interaction clarity
- consistency
- mobile responsiveness

Rank issues as Critical, High, Medium, or Low.

For every issue provide:
1. Problem
2. Why it matters
3. Recommended fix`,
    rating: 4.8,
    usageCount: 12,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  {
    id: "prd-writer",
    title: "PRD Writer",
    category: "Product",
    content: `Act as a senior product manager.

Turn the provided product idea into a concise PRD.

Include:
- Problem
- Target users
- User stories
- Requirements
- Non-functional requirements
- Success metrics
- Risks
- MVP scope`,
    rating: 4.6,
    usageCount: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function read(): Prompt[] {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(starterPrompts));
    return starterPrompts;
  }

  try {
    return JSON.parse(saved);
  } catch {
    return starterPrompts;
  }
}

function write(prompts: Prompt[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));

  window.dispatchEvent(
    new CustomEvent("promptlab:prompts-updated")
  );
}

export const promptStore = {
  getAll(): Prompt[] {
    return read();
  },

  get(id: string): Prompt | undefined {
    return read().find((prompt) => prompt.id === id);
  },

  search(query: string): Prompt[] {
    const q = query.toLowerCase();

    return read().filter((prompt) =>
      [
        prompt.title,
        prompt.content,
        prompt.category,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  },

  create(input: {
    title: string;
    content: string;
    category?: string;
  }): Prompt {
    const prompts = read();

    const prompt: Prompt = {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      category: input.category || "General",
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    write([prompt, ...prompts]);

    return prompt;
  },

  update(
    id: string,
    updates: Partial<
      Pick<Prompt, "title" | "content" | "category" | "rating">
    >
  ): Prompt | null {
    const prompts = read();

    const index = prompts.findIndex(
      (prompt) => prompt.id === id
    );

    if (index === -1) return null;

    prompts[index] = {
      ...prompts[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    write(prompts);

    return prompts[index];
  },

  recordUse(id: string): Prompt | null {
    const prompts = read();

    const index = prompts.findIndex(
      (prompt) => prompt.id === id
    );

    if (index === -1) return null;

    prompts[index].usageCount += 1;
    prompts[index].updatedAt = new Date().toISOString();

    write(prompts);

    return prompts[index];
  },

  remove(id: string) {
    write(
      read().filter((prompt) => prompt.id !== id)
    );
  },
};