export type PromptAgent = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  defaultCategory: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "promptlab_agents";

const now = new Date().toISOString();

const starterAgents: PromptAgent[] = [
  {
    id: "product-builder",
    name: "Product Builder",
    role: "Product strategist and app architect",
    instructions:
      "Turn rough product ideas into specific, buildable decisions. Challenge assumptions, define the user and make every output actionable.",
    defaultCategory: "Product",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "design-partner",
    name: "Design Partner",
    role: "Senior product and interaction designer",
    instructions:
      "Prioritise clear user flows, strong information hierarchy, accessible interaction patterns and concrete visual direction.",
    defaultCategory: "Design",
    createdAt: now,
    updatedAt: now,
  },
];

function read(): PromptAgent[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(starterAgents));
    return starterAgents;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : starterAgents;
  } catch {
    return starterAgents;
  }
}

function write(agents: PromptAgent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  window.dispatchEvent(new CustomEvent("promptlab:agents-updated"));
}

export const agentStore = {
  getAll(): PromptAgent[] {
    return read();
  },

  get(id: string): PromptAgent | undefined {
    return read().find((agent) => agent.id === id);
  },

  create(input: {
    name: string;
    role: string;
    instructions: string;
    defaultCategory?: string;
  }): PromptAgent {
    const timestamp = new Date().toISOString();
    const agent: PromptAgent = {
      id: crypto.randomUUID(),
      name: input.name,
      role: input.role,
      instructions: input.instructions,
      defaultCategory: input.defaultCategory || "General",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    write([agent, ...read()]);
    return agent;
  },

  update(
    id: string,
    updates: Partial<
      Pick<PromptAgent, "name" | "role" | "instructions" | "defaultCategory">
    >
  ): PromptAgent | null {
    const agents = read();
    const index = agents.findIndex((agent) => agent.id === id);
    if (index === -1) return null;

    agents[index] = {
      ...agents[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    write(agents);
    return agents[index];
  },

  remove(id: string) {
    write(read().filter((agent) => agent.id !== id));
  },

  replaceAll(agents: PromptAgent[]) {
    const timestamp = new Date().toISOString();
    write(
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        instructions: agent.instructions,
        defaultCategory: agent.defaultCategory || "General",
        createdAt: agent.createdAt || timestamp,
        updatedAt: agent.updatedAt || timestamp,
      }))
    );
  },
};
