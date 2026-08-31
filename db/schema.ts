import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  instructions: text("instructions").notNull(),
  defaultCategory: text("default_category").notNull().default("General"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const prompts = sqliteTable(
  "prompts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("General"),
    agentId: text("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    rating: real("rating"),
    usageCount: integer("usage_count").notNull().default(0),
    familyId: text("family_id").notNull(),
    parentPromptId: text("parent_prompt_id"),
    versionLabel: text("version_label"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_prompts_agent_id").on(table.agentId),
    index("idx_prompts_family_id").on(table.familyId),
    index("idx_prompts_updated_at").on(table.updatedAt),
  ]
);

export const promptVersions = sqliteTable(
  "prompt_versions",
  {
    id: text("id").primaryKey(),
    promptId: text("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull(),
    agentId: text("agent_id"),
    versionLabel: text("version_label"),
    changeSummary: text("change_summary"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_prompt_versions_prompt_id").on(
      table.promptId,
      table.versionNumber
    ),
  ]
);

export const remoteActivity = sqliteTable(
  "remote_activity",
  {
    id: text("id").primaryKey(),
    tool: text("tool").notNull(),
    inputJson: text("input_json").notNull(),
    summary: text("summary").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_remote_activity_created_at").on(table.createdAt)]
);
