export type AgentRecord = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  defaultCategory: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptRecord = {
  id: string;
  title: string;
  content: string;
  category: string;
  agentId: string | null;
  rating: number | null;
  usageCount: number;
  familyId: string;
  parentPromptId: string | null;
  versionLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromptVersionRecord = {
  id: string;
  promptId: string;
  versionNumber: number;
  title: string;
  content: string;
  category: string;
  agentId: string | null;
  versionLabel: string | null;
  changeSummary: string | null;
  createdAt: string;
};

export type RemoteActivityRecord = {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  ok: boolean;
  at: string;
};

type AgentRow = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  default_category: string;
  created_at: string;
  updated_at: string;
};

type PromptRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  agent_id: string | null;
  rating: number | null;
  usage_count: number;
  family_id: string;
  parent_prompt_id: string | null;
  version_label: string | null;
  created_at: string;
  updated_at: string;
};

type PromptVersionRow = {
  id: string;
  prompt_id: string;
  version_number: number;
  title: string;
  content: string;
  category: string;
  agent_id: string | null;
  version_label: string | null;
  change_summary: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  tool: string;
  input_json: string;
  summary: string;
  ok: number;
  created_at: string;
};

const starterAgents: AgentRecord[] = [
  {
    id: "product-builder",
    name: "Product Builder",
    role: "Product strategist and app architect",
    instructions:
      "Turn rough product ideas into specific, buildable decisions. Challenge assumptions, define the user and make every output actionable.",
    defaultCategory: "Product",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "design-partner",
    name: "Design Partner",
    role: "Senior product and interaction designer",
    instructions:
      "Prioritise clear user flows, strong information hierarchy, accessible interaction patterns and concrete visual direction.",
    defaultCategory: "Design",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const starterPrompts: PromptRecord[] = [
  {
    id: "ux-audit",
    title: "Senior UX Audit",
    category: "Design",
    agentId: "design-partner",
    content: `Act as a senior product designer and UX researcher.

Audit the provided interface for usability, information hierarchy, accessibility, interaction clarity, consistency and mobile responsiveness.

Rank issues as Critical, High, Medium or Low. For every issue provide the problem, why it matters and a recommended fix.`,
    rating: 4.8,
    usageCount: 12,
    familyId: "ux-audit",
    parentPromptId: null,
    versionLabel: "Original",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "prd-writer",
    title: "PRD Writer",
    category: "Product",
    agentId: "product-builder",
    content: `Act as a senior product manager.

Turn the provided product idea into a concise PRD. Include the problem, target users, user stories, requirements, non-functional requirements, success metrics, risks and MVP scope.`,
    rating: 4.6,
    usageCount: 8,
    familyId: "prd-writer",
    parentPromptId: null,
    versionLabel: "Original",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const initialization = new WeakMap<object, Promise<void>>();

function toAgent(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    instructions: row.instructions,
    defaultCategory: row.default_category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPrompt(row: PromptRow): PromptRecord {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    agentId: row.agent_id,
    rating: row.rating,
    usageCount: row.usage_count,
    familyId: row.family_id,
    parentPromptId: row.parent_prompt_id,
    versionLabel: row.version_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVersion(row: PromptVersionRow): PromptVersionRecord {
  return {
    id: row.id,
    promptId: row.prompt_id,
    versionNumber: row.version_number,
    title: row.title,
    content: row.content,
    category: row.category,
    agentId: row.agent_id,
    versionLabel: row.version_label,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  };
}

async function initialize(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      instructions TEXT NOT NULL,
      default_category TEXT DEFAULT 'General' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General' NOT NULL,
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      rating REAL,
      usage_count INTEGER DEFAULT 0 NOT NULL,
      family_id TEXT NOT NULL,
      parent_prompt_id TEXT,
      version_label TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY NOT NULL,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      agent_id TEXT,
      version_label TEXT,
      change_summary TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS remote_activity (
      id TEXT PRIMARY KEY NOT NULL,
      tool TEXT NOT NULL,
      input_json TEXT NOT NULL,
      summary TEXT NOT NULL,
      ok INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
  ]);

  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_prompts_agent_id ON prompts(agent_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_prompts_family_id ON prompts(family_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt_id ON prompt_versions(prompt_id, version_number)"
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_remote_activity_created_at ON remote_activity(created_at)"
    ),
  ]);

  for (const agent of starterAgents) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO agents
        (id, name, role, instructions, default_category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        agent.id,
        agent.name,
        agent.role,
        agent.instructions,
        agent.defaultCategory,
        agent.createdAt,
        agent.updatedAt
      )
      .run();
  }

  for (const prompt of starterPrompts) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO prompts
        (id, title, content, category, agent_id, rating, usage_count, family_id,
         parent_prompt_id, version_label, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        prompt.id,
        prompt.title,
        prompt.content,
        prompt.category,
        prompt.agentId,
        prompt.rating,
        prompt.usageCount,
        prompt.familyId,
        prompt.parentPromptId,
        prompt.versionLabel,
        prompt.createdAt,
        prompt.updatedAt
      )
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO prompt_versions
        (id, prompt_id, version_number, title, content, category, agent_id,
         version_label, change_summary, created_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `${prompt.id}-v1`,
        prompt.id,
        prompt.title,
        prompt.content,
        prompt.category,
        prompt.agentId,
        prompt.versionLabel,
        "Initial version",
        prompt.createdAt
      )
      .run();
  }

  await db.prepare("PRAGMA optimize").run();
}

export async function ensureDatabase(db: D1Database) {
  const key = db as unknown as object;
  let pending = initialization.get(key);
  if (!pending) {
    pending = initialize(db);
    initialization.set(key, pending);
  }
  try {
    await pending;
  } catch (error) {
    initialization.delete(key);
    throw error;
  }
}

export async function listAgents(db: D1Database): Promise<AgentRecord[]> {
  await ensureDatabase(db);
  const result = await db
    .prepare("SELECT * FROM agents ORDER BY name COLLATE NOCASE")
    .all<AgentRow>();
  return result.results.map(toAgent);
}

export async function getAgent(
  db: D1Database,
  id: string
): Promise<AgentRecord | null> {
  await ensureDatabase(db);
  const row = await db
    .prepare("SELECT * FROM agents WHERE id = ?")
    .bind(id)
    .first<AgentRow>();
  return row ? toAgent(row) : null;
}

export async function createAgent(
  db: D1Database,
  input: Pick<AgentRecord, "name" | "role" | "instructions"> & {
    defaultCategory?: string;
  }
): Promise<AgentRecord> {
  await ensureDatabase(db);
  const timestamp = new Date().toISOString();
  const agent: AgentRecord = {
    id: crypto.randomUUID(),
    name: input.name,
    role: input.role,
    instructions: input.instructions,
    defaultCategory: input.defaultCategory || "General",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db
    .prepare(
      `INSERT INTO agents
      (id, name, role, instructions, default_category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      agent.id,
      agent.name,
      agent.role,
      agent.instructions,
      agent.defaultCategory,
      agent.createdAt,
      agent.updatedAt
    )
    .run();
  return agent;
}

export async function updateAgent(
  db: D1Database,
  id: string,
  updates: Partial<
    Pick<AgentRecord, "name" | "role" | "instructions" | "defaultCategory">
  >
): Promise<AgentRecord | null> {
  const current = await getAgent(db, id);
  if (!current) return null;
  const next = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await db
    .prepare(
      `UPDATE agents SET name = ?, role = ?, instructions = ?,
       default_category = ?, updated_at = ? WHERE id = ?`
    )
    .bind(
      next.name,
      next.role,
      next.instructions,
      next.defaultCategory,
      next.updatedAt,
      id
    )
    .run();
  return next;
}

export async function searchPrompts(
  db: D1Database,
  input: {
    query?: string;
    category?: string;
    agentId?: string;
    limit?: number;
  }
): Promise<PromptRecord[]> {
  await ensureDatabase(db);
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.query) {
    conditions.push(
      "(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')"
    );
    const escaped = input.query.replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    values.push(pattern, pattern, pattern);
  }
  if (input.category) {
    conditions.push("category = ?");
    values.push(input.category);
  }
  if (input.agentId) {
    conditions.push("agent_id = ?");
    values.push(input.agentId);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  values.push(limit);
  const result = await db
    .prepare(`SELECT * FROM prompts${where} ORDER BY updated_at DESC LIMIT ?`)
    .bind(...values)
    .all<PromptRow>();
  return result.results.map(toPrompt);
}

export async function getPrompt(
  db: D1Database,
  id: string
): Promise<PromptRecord | null> {
  await ensureDatabase(db);
  const row = await db
    .prepare("SELECT * FROM prompts WHERE id = ?")
    .bind(id)
    .first<PromptRow>();
  return row ? toPrompt(row) : null;
}

export async function createPrompt(
  db: D1Database,
  input: {
    title: string;
    content: string;
    category?: string;
    agentId?: string;
    parentPromptId?: string;
    versionLabel?: string;
    changeSummary?: string;
  }
): Promise<PromptRecord> {
  await ensureDatabase(db);
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const parent = input.parentPromptId
    ? await getPrompt(db, input.parentPromptId)
    : null;
  if (input.parentPromptId && !parent) {
    throw new Error(`No parent prompt found with id "${input.parentPromptId}".`);
  }
  if (input.agentId && !(await getAgent(db, input.agentId))) {
    throw new Error(`No agent found with id "${input.agentId}".`);
  }
  const prompt: PromptRecord = {
    id,
    title: input.title,
    content: input.content,
    category: input.category || parent?.category || "General",
    agentId: input.agentId || parent?.agentId || null,
    rating: null,
    usageCount: 0,
    familyId: parent?.familyId || id,
    parentPromptId: parent?.id || null,
    versionLabel: input.versionLabel || (parent ? "Variant" : "Original"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.batch([
    db
      .prepare(
        `INSERT INTO prompts
        (id, title, content, category, agent_id, rating, usage_count, family_id,
         parent_prompt_id, version_label, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        prompt.id,
        prompt.title,
        prompt.content,
        prompt.category,
        prompt.agentId,
        prompt.rating,
        prompt.usageCount,
        prompt.familyId,
        prompt.parentPromptId,
        prompt.versionLabel,
        prompt.createdAt,
        prompt.updatedAt
      ),
    db
      .prepare(
        `INSERT INTO prompt_versions
        (id, prompt_id, version_number, title, content, category, agent_id,
         version_label, change_summary, created_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        prompt.id,
        prompt.title,
        prompt.content,
        prompt.category,
        prompt.agentId,
        prompt.versionLabel,
        input.changeSummary || "Initial version",
        timestamp
      ),
  ]);
  return prompt;
}

export async function updatePrompt(
  db: D1Database,
  id: string,
  updates: Partial<
    Pick<
      PromptRecord,
      "title" | "content" | "category" | "agentId" | "versionLabel"
    >
  >,
  changeSummary?: string
): Promise<PromptRecord | null> {
  const current = await getPrompt(db, id);
  if (!current) return null;
  if (updates.agentId && !(await getAgent(db, updates.agentId))) {
    throw new Error(`No agent found with id "${updates.agentId}".`);
  }
  const next: PromptRecord = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const version = await db
    .prepare(
      "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM prompt_versions WHERE prompt_id = ?"
    )
    .bind(id)
    .first<{ next_version: number }>();
  await db.batch([
    db
      .prepare(
        `UPDATE prompts SET title = ?, content = ?, category = ?, agent_id = ?,
         version_label = ?, updated_at = ? WHERE id = ?`
      )
      .bind(
        next.title,
        next.content,
        next.category,
        next.agentId,
        next.versionLabel,
        next.updatedAt,
        id
      ),
    db
      .prepare(
        `INSERT INTO prompt_versions
        (id, prompt_id, version_number, title, content, category, agent_id,
         version_label, change_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        id,
        version?.next_version ?? 1,
        next.title,
        next.content,
        next.category,
        next.agentId,
        next.versionLabel,
        changeSummary || "Updated through remote MCP",
        next.updatedAt
      ),
  ]);
  return next;
}

export async function getPromptHistory(
  db: D1Database,
  promptId: string
): Promise<PromptVersionRecord[]> {
  await ensureDatabase(db);
  const result = await db
    .prepare(
      "SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version_number ASC"
    )
    .bind(promptId)
    .all<PromptVersionRow>();
  return result.results.map(toVersion);
}

export async function setPromptRating(
  db: D1Database,
  id: string,
  rating: number
): Promise<PromptRecord | null> {
  const current = await getPrompt(db, id);
  if (!current) return null;
  const updatedAt = new Date().toISOString();
  await db
    .prepare("UPDATE prompts SET rating = ?, updated_at = ? WHERE id = ?")
    .bind(rating, updatedAt, id)
    .run();
  return { ...current, rating, updatedAt };
}

export async function recordPromptUse(
  db: D1Database,
  id: string
): Promise<PromptRecord | null> {
  const current = await getPrompt(db, id);
  if (!current) return null;
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      "UPDATE prompts SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?"
    )
    .bind(updatedAt, id)
    .run();
  return { ...current, usageCount: current.usageCount + 1, updatedAt };
}

export async function deletePrompt(
  db: D1Database,
  id: string
): Promise<PromptRecord | null> {
  const current = await getPrompt(db, id);
  if (!current) return null;
  await db.prepare("DELETE FROM prompts WHERE id = ?").bind(id).run();
  return current;
}

export async function logRemoteActivity(
  db: D1Database,
  input: {
    tool: string;
    arguments: Record<string, unknown>;
    summary: string;
    ok: boolean;
  }
) {
  await ensureDatabase(db);
  const timestamp = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO remote_activity
      (id, tool, input_json, summary, ok, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.tool,
      JSON.stringify(input.arguments),
      input.summary,
      input.ok ? 1 : 0,
      timestamp
    )
    .run();
  await db
    .prepare(
      `DELETE FROM remote_activity WHERE id NOT IN (
        SELECT id FROM remote_activity ORDER BY created_at DESC LIMIT 100
      )`
    )
    .run();
}

export async function listRemoteActivity(
  db: D1Database,
  limit = 25
): Promise<RemoteActivityRecord[]> {
  await ensureDatabase(db);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const result = await db
    .prepare(
      "SELECT * FROM remote_activity ORDER BY created_at DESC LIMIT ?"
    )
    .bind(safeLimit)
    .all<ActivityRow>();
  return result.results.map((row) => {
    let input: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.input_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      // Keep malformed historical input isolated from the activity endpoint.
    }
    return {
      id: row.id,
      tool: row.tool,
      input,
      summary: row.summary,
      ok: Boolean(row.ok),
      at: row.created_at,
    };
  });
}
