/**
 * Exposing the library as MCP *prompts* rather than only as tools.
 *
 * Tools let an agent operate the library. Prompts let a client surface the
 * library directly: an MCP host lists `prompts/list` in its slash menu, so a
 * saved Prompt Lab prompt becomes a command the user picks, with its
 * `{{placeholders}}` collected as arguments. That is the whole product showing
 * up inside someone else's client without them browsing this site.
 *
 * Shared by the remote MCP server and the export tool so a prompt is named and
 * argued identically wherever it surfaces.
 */

import { parseSpec, renderSpec, type PromptSpec } from "./promptSpec";
import { extractVariables, renderPrompt } from "./variables";

/* ------------------------------------------------------------------ *
 * Naming
 * ------------------------------------------------------------------ */

/**
 * "Cover letter — UX Designer" → "cover-letter-ux-designer".
 *
 * MCP prompt names are the user-visible command, so they have to be stable,
 * readable and unique within one server. `taken` is mutated with the result.
 */
export function promptSlug(title: string, taken?: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "prompt";

  if (!taken) return base;

  let name = base;
  let suffix = 2;
  while (taken.has(name)) {
    name = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(name);
  return name;
}

/** `{{what you sell}}` is a fine placeholder but a poor argument name. */
export function argumentName(variable: string): string {
  return (
    variable
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "input"
  );
}

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

export type PromptArgumentSpec = {
  /** The MCP argument name, safe for a client to render and send. */
  name: string;
  /** The `{{placeholder}}` this argument fills. */
  variable: string;
  description: string;
  required: boolean;
};

/**
 * Derives MCP arguments from a prompt's placeholders.
 *
 * The spec's context lines carry a human label for each placeholder
 * (`- What you sell: {{what you sell}}`), so the argument gets a real
 * description instead of repeating its own name back at the user.
 */
export function promptArguments(
  content: string,
  spec: PromptSpec = parseSpec(content)
): PromptArgumentSpec[] {
  const labels = new Map<string, string>();
  for (const field of spec.context) {
    if (field.placeholder) labels.set(field.placeholder, field.label);
  }

  const taken = new Set<string>();
  return extractVariables(content).map((variable) => {
    let name = argumentName(variable);
    let suffix = 2;
    while (taken.has(name)) {
      name = `${argumentName(variable)}_${suffix}`;
      suffix += 1;
    }
    taken.add(name);

    const label = labels.get(variable);
    return {
      name,
      variable,
      description: label ? `${label}.` : `Value for "${variable}".`,
      // Everything the prompt asks for is needed; an unfilled placeholder is
      // left visible rather than silently dropped, so nothing is fatal.
      required: false,
    };
  });
}

/** Maps client-supplied argument values back onto `{{placeholders}}`. */
export function fillFromArguments(
  content: string,
  args: PromptArgumentSpec[],
  values: Record<string, unknown>
): { text: string; filled: string[]; missing: string[] } {
  const byVariable: Record<string, string> = {};
  const filled: string[] = [];
  const missing: string[] = [];

  for (const argument of args) {
    const raw = values[argument.name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) {
      byVariable[argument.variable] = value;
      filled.push(argument.name);
    } else {
      missing.push(argument.name);
    }
  }

  return { text: renderPrompt(content, byVariable), filled, missing };
}

/** One line describing a prompt, for the client's command list. */
export function promptDescription(
  content: string,
  spec: PromptSpec = parseSpec(content)
): string {
  const source =
    spec.objective ??
    spec.preamble ??
    content.split("\n").find((line) => line.trim()) ??
    "";
  const line = source.replace(/\s+/g, " ").trim();
  return line.length > 180 ? `${line.slice(0, 179)}…` : line;
}

/* ------------------------------------------------------------------ *
 * Export targets
 * ------------------------------------------------------------------ */

export type ExportTarget =
  | "markdown"
  | "prompt-md"
  | "cursor-rule"
  | "claude-skill"
  | "json-spec"
  | "mcp-prompt";

export const EXPORT_TARGETS: { id: ExportTarget; label: string; extension: string }[] =
  [
    { id: "markdown", label: "Markdown", extension: "md" },
    { id: "prompt-md", label: "Prompt file (.prompt.md)", extension: "prompt.md" },
    { id: "cursor-rule", label: "Cursor rule (.mdc)", extension: "mdc" },
    { id: "claude-skill", label: "Claude skill (SKILL.md)", extension: "md" },
    { id: "json-spec", label: "Structured spec (JSON)", extension: "json" },
    { id: "mcp-prompt", label: "MCP prompt definition (JSON)", extension: "json" },
  ];

export type ExportablePrompt = {
  title: string;
  content: string;
  category?: string;
  description?: string;
};

/** YAML needs quoting for anything with a colon or a leading special char. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Re-renders a prompt for somewhere other than Prompt Lab.
 *
 * The structured spec is what makes this possible: the same prompt can be
 * written out as a Cursor rule, a skill or a JSON spec because its parts are
 * addressable, not because the text is copied.
 */
export function compilePrompt(
  prompt: ExportablePrompt,
  target: ExportTarget
): { filename: string; contentType: string; body: string } {
  const spec = parseSpec(prompt.content);
  const slug = promptSlug(prompt.title);
  const description = prompt.description ?? promptDescription(prompt.content, spec);
  const extension =
    EXPORT_TARGETS.find((entry) => entry.id === target)?.extension ?? "md";

  switch (target) {
    case "prompt-md":
      return {
        filename: `${slug}.prompt.md`,
        contentType: "text/markdown",
        body: [
          "---",
          `description: ${yamlString(description)}`,
          "---",
          "",
          prompt.content,
          "",
        ].join("\n"),
      };

    case "cursor-rule":
      return {
        filename: `${slug}.mdc`,
        contentType: "text/markdown",
        body: [
          "---",
          `description: ${yamlString(description)}`,
          "alwaysApply: false",
          "---",
          "",
          prompt.content,
          "",
        ].join("\n"),
      };

    case "claude-skill":
      return {
        filename: `${slug}/SKILL.md`,
        contentType: "text/markdown",
        body: [
          "---",
          `name: ${slug}`,
          `description: ${yamlString(description)}`,
          "---",
          "",
          `# ${prompt.title}`,
          "",
          prompt.content,
          "",
        ].join("\n"),
      };

    case "json-spec":
      return {
        filename: `${slug}.json`,
        contentType: "application/json",
        body: JSON.stringify(
          {
            title: prompt.title,
            category: prompt.category,
            description,
            spec,
            rendered: renderSpec(spec),
          },
          null,
          2
        ),
      };

    case "mcp-prompt":
      return {
        filename: `${slug}.json`,
        contentType: "application/json",
        body: JSON.stringify(
          {
            name: slug,
            title: prompt.title,
            description,
            arguments: promptArguments(prompt.content, spec).map(
              ({ name, description: argDescription, required }) => ({
                name,
                description: argDescription,
                required,
              })
            ),
          },
          null,
          2
        ),
      };

    case "markdown":
    default:
      return {
        filename: `${slug}.${extension}`,
        contentType: "text/markdown",
        body: `# ${prompt.title}\n\n${prompt.content}\n`,
      };
  }
}
