/**
 * The structured view of a prompt.
 *
 * `catalog.ts` renders its prompts from a spec — role, objective, context,
 * process, output — but the personal library stores only the rendered string,
 * so everything downstream had to guess the structure back with regexes.
 *
 * This module makes the spec a *lens* over the stored text rather than a second
 * stored field. `parseSpec` recovers the structure, `renderSpec` writes it back,
 * and the two round-trip exactly for anything the catalog, the studio or the
 * generator produced. Nothing is migrated and `content` stays the single source
 * of truth, so a hand-written prompt is never silently rewritten.
 *
 * With the structure available, evaluation scores real fields, diffs are
 * per-section rather than per-line, and a prompt can be re-rendered for a
 * different target instead of only copied.
 */

/** The fixed guardrail block the catalog renders into every prompt. */
export const DEFAULT_GUARDRAIL =
  "Ask up to 3 concise questions only if a missing detail would materially change your answer. Otherwise state your assumptions and continue. Never invent facts, figures, quotes or research — mark anything that needs checking.";

export type ContextField = {
  /** "What you sell" */
  label: string;
  /** The `{{placeholder}}` name, when the line carries one. */
  placeholder: string | null;
  /** The line as written, used when it does not fit `label: {{placeholder}}`. */
  raw: string;
};

export type PromptSpec = {
  /** Filled into "Act as …", without the verb or the full stop. */
  role: string | null;
  objective: string | null;
  /** The catalog's role-variant block, appended under the objective. */
  specialisation: string | null;
  context: ContextField[];
  guardrails: string | null;
  /** The catalog uses "Stages" for master-tier prompts and "Process" elsewhere. */
  processHeading: ProcessHeading;
  process: string[];
  constraints: string[];
  output: string[];
  examples: string[];
  /** The trailing instruction after the output block. */
  closing: string | null;
  /** Anything ahead of the first recognised section, preserved verbatim. */
  preamble: string | null;
};

export type ProcessHeading = "Process" | "Stages" | "Steps";

/** The sections a prompt can carry, in the order they render. */
export type SpecSectionKey =
  | "role"
  | "objective"
  | "specialisation"
  | "context"
  | "guardrails"
  | "process"
  | "constraints"
  | "output"
  | "examples"
  | "closing"
  | "preamble";

/** The five sections that decide whether a prompt is a spec or a wish. */
export const CORE_SECTIONS = [
  "role",
  "objective",
  "context",
  "process",
  "output",
] as const satisfies readonly SpecSectionKey[];

export const SECTION_LABELS: Record<SpecSectionKey, string> = {
  role: "Role",
  objective: "Objective",
  specialisation: "Specialisation",
  context: "Context",
  guardrails: "Guardrails",
  process: "Process",
  constraints: "Constraints",
  output: "Output format",
  examples: "Examples",
  closing: "Closing",
  preamble: "Unstructured text",
};

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

type HeadingTarget = Exclude<SpecSectionKey, "role" | "closing" | "preamble">;

/**
 * Heading aliases, lower-cased. The first entry of each group is what the
 * catalog emits; the rest are the shapes hand-written and model-written prompts
 * use for the same section.
 */
const HEADINGS: { target: HeadingTarget; aliases: string[] }[] = [
  { target: "objective", aliases: ["objective", "goal", "task", "objectives"] },
  { target: "specialisation", aliases: ["specialisation", "specialization"] },
  {
    target: "context",
    aliases: [
      "context i am giving you",
      "context",
      "context i give you",
      "inputs",
      "input",
      "what i am giving you",
    ],
  },
  {
    target: "guardrails",
    aliases: ["before you begin", "guardrails", "ground rules", "rules"],
  },
  { target: "process", aliases: ["process", "stages", "steps", "method"] },
  {
    target: "constraints",
    aliases: ["constraints", "limits", "do not", "avoid"],
  },
  {
    target: "output",
    aliases: [
      "return exactly",
      "output",
      "output format",
      "return",
      "deliverable",
      "deliverables",
    ],
  },
  { target: "examples", aliases: ["examples", "example"] },
];

const PROCESS_HEADINGS: Record<string, ProcessHeading> = {
  process: "Process",
  stages: "Stages",
  steps: "Steps",
  method: "Process",
};

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
const CONTEXT_LINE = /^(.*?):\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;
const ROLE_LINE = /^Act as\s+([\s\S]+?)\.\s*$/;

function matchHeading(line: string): HeadingTarget | null {
  const normalised = line.trim().toLowerCase().replace(/[:：]\s*$/, "");
  if (!normalised || normalised.length > 40) return null;
  for (const { target, aliases } of HEADINGS) {
    if (aliases.includes(normalised)) return target;
  }
  return null;
}

function emptySpec(): PromptSpec {
  return {
    role: null,
    objective: null,
    specialisation: null,
    context: [],
    guardrails: null,
    processHeading: "Process",
    process: [],
    constraints: [],
    output: [],
    examples: [],
    closing: null,
    preamble: null,
  };
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

/**
 * Splits a section body into its leading list items and the prose that follows
 * them. The catalog puts its closing line after the output list, so the trailer
 * is how that line is recovered without a heading of its own.
 */
function splitListAndTrailer(lines: string[]): {
  items: string[];
  trailer: string | null;
} {
  const body = trimBlank(lines);
  const items: string[] = [];
  let index = 0;
  while (index < body.length) {
    const match = body[index].match(LIST_ITEM);
    if (!match) break;
    items.push(match[1].trim());
    index += 1;
  }
  const rest = trimBlank(body.slice(index));
  return {
    items,
    trailer: rest.length > 0 ? rest.join("\n") : null,
  };
}

function toContextField(item: string): ContextField {
  const match = item.match(CONTEXT_LINE);
  if (!match) return { label: item, placeholder: null, raw: item };
  return {
    label: match[1].trim(),
    placeholder: match[2].trim(),
    raw: item,
  };
}

/**
 * Recovers the structure of a prompt. Anything unrecognised is preserved rather
 * than dropped, so `renderSpec(parseSpec(text))` never loses content.
 */
export function parseSpec(content: string): PromptSpec {
  const spec = emptySpec();
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  const sections = new Map<HeadingTarget, string[]>();
  let current: HeadingTarget | null = null;
  const head: string[] = [];

  for (const line of lines) {
    const heading = matchHeading(line);
    // A heading only opens a section when it stands alone on its line.
    if (heading && !sections.has(heading)) {
      if (heading === "process") {
        const key = line.trim().toLowerCase().replace(/[:：]\s*$/, "");
        spec.processHeading = PROCESS_HEADINGS[key] ?? "Process";
      }
      current = heading;
      sections.set(heading, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else head.push(line);
  }

  // The opening "Act as …" line, and whatever else precedes the first heading.
  const headLines = trimBlank(head);
  if (headLines.length > 0) {
    const roleMatch = headLines[0].match(ROLE_LINE);
    if (roleMatch) {
      spec.role = roleMatch[1].trim();
      const rest = trimBlank(headLines.slice(1));
      spec.preamble = rest.length > 0 ? rest.join("\n") : null;
    } else {
      spec.preamble = headLines.join("\n");
    }
  }

  const prose = (target: HeadingTarget): string | null => {
    const body = trimBlank(sections.get(target) ?? []);
    return body.length > 0 ? body.join("\n") : null;
  };

  spec.objective = prose("objective");
  spec.specialisation = prose("specialisation");
  spec.guardrails = prose("guardrails");

  const context = splitListAndTrailer(sections.get("context") ?? []);
  spec.context = context.items.map(toContextField);

  const process = splitListAndTrailer(sections.get("process") ?? []);
  spec.process = process.items;

  const constraints = splitListAndTrailer(sections.get("constraints") ?? []);
  spec.constraints = constraints.items;

  const output = splitListAndTrailer(sections.get("output") ?? []);
  spec.output = output.items;

  const examples = splitListAndTrailer(sections.get("examples") ?? []);
  spec.examples = examples.items;

  // The closing belongs to whichever list section came last in the text.
  spec.closing =
    examples.trailer ??
    output.trailer ??
    constraints.trailer ??
    process.trailer ??
    context.trailer ??
    null;

  // A section whose body was prose rather than a list would otherwise vanish.
  if (spec.context.length === 0 && context.trailer && spec.closing !== context.trailer) {
    spec.context = [toContextField(context.trailer)];
  }

  return spec;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function contextLine(field: ContextField) {
  return field.placeholder
    ? `- ${field.label}: {{${field.placeholder}}}`
    : `- ${field.raw}`;
}

/** Writes a spec back out in the canonical Prompt Lab shape. */
export function renderSpec(spec: PromptSpec): string {
  const blocks: string[] = [];

  if (spec.role) blocks.push(`Act as ${spec.role}.`);
  if (spec.preamble) blocks.push(spec.preamble);
  if (spec.objective) blocks.push(`Objective\n${spec.objective}`);
  if (spec.specialisation)
    blocks.push(`Specialisation\n${spec.specialisation}`);
  if (spec.context.length > 0)
    blocks.push(
      `Context I am giving you\n${spec.context.map(contextLine).join("\n")}`
    );
  if (spec.guardrails) blocks.push(`Before you begin\n${spec.guardrails}`);
  if (spec.process.length > 0)
    blocks.push(`${spec.processHeading}\n${list(spec.process)}`);
  if (spec.constraints.length > 0)
    blocks.push(`Constraints\n${list(spec.constraints)}`);
  if (spec.output.length > 0)
    blocks.push(`Return exactly\n${list(spec.output)}`);
  if (spec.examples.length > 0) blocks.push(`Examples\n${list(spec.examples)}`);
  if (spec.closing) blocks.push(spec.closing);

  return blocks.join("\n\n");
}

/**
 * Whether the text is already in canonical form, so re-rendering it would
 * change nothing. Callers that write a parsed spec back to storage should check
 * this first — a `false` means normalising would reformat the author's text.
 */
export function isCanonical(content: string): boolean {
  return renderSpec(parseSpec(content)) === content.trim();
}

/* ------------------------------------------------------------------ *
 * Inspection
 * ------------------------------------------------------------------ */

/** Which sections the prompt actually carries. */
export function presentSections(spec: PromptSpec): SpecSectionKey[] {
  const present: SpecSectionKey[] = [];
  if (spec.role) present.push("role");
  if (spec.objective) present.push("objective");
  if (spec.specialisation) present.push("specialisation");
  if (spec.context.length > 0) present.push("context");
  if (spec.guardrails) present.push("guardrails");
  if (spec.process.length > 0) present.push("process");
  if (spec.constraints.length > 0) present.push("constraints");
  if (spec.output.length > 0) present.push("output");
  if (spec.examples.length > 0) present.push("examples");
  return present;
}

/** Which of the five core sections are missing. */
export function missingCoreSections(spec: PromptSpec): SpecSectionKey[] {
  const present = new Set(presentSections(spec));
  return CORE_SECTIONS.filter((key) => !present.has(key));
}

/**
 * 0–100 on how much of the prompt is structured rather than prose. A prompt
 * with all five core sections and no leftover preamble scores 100.
 */
export function structureScore(spec: PromptSpec): number {
  const core = CORE_SECTIONS.filter((key) =>
    presentSections(spec).includes(key)
  ).length;
  const base = (core / CORE_SECTIONS.length) * 100;
  // Leftover prose means part of the prompt escaped the structure.
  return Math.round(spec.preamble ? base * 0.8 : base);
}

/* ------------------------------------------------------------------ *
 * Diffing
 * ------------------------------------------------------------------ */

export type SpecFieldChange = {
  section: SpecSectionKey;
  label: string;
  status: "added" | "removed" | "changed" | "unchanged";
  before: string | null;
  after: string | null;
};

function sectionText(spec: PromptSpec, key: SpecSectionKey): string | null {
  switch (key) {
    case "role":
      return spec.role;
    case "objective":
      return spec.objective;
    case "specialisation":
      return spec.specialisation;
    case "context":
      return spec.context.length ? spec.context.map(contextLine).join("\n") : null;
    case "guardrails":
      return spec.guardrails;
    case "process":
      return spec.process.length ? list(spec.process) : null;
    case "constraints":
      return spec.constraints.length ? list(spec.constraints) : null;
    case "output":
      return spec.output.length ? list(spec.output) : null;
    case "examples":
      return spec.examples.length ? list(spec.examples) : null;
    case "closing":
      return spec.closing;
    case "preamble":
      return spec.preamble;
  }
}

const DIFF_ORDER: SpecSectionKey[] = [
  "role",
  "objective",
  "specialisation",
  "context",
  "guardrails",
  "process",
  "constraints",
  "output",
  "examples",
  "closing",
  "preamble",
];

/**
 * A section-by-section difference between two prompts.
 *
 * A line diff says "line 14 changed". This says "the output format changed and
 * the role did not", which is the sentence a reviewer actually needs.
 */
export function diffSpecs(
  before: PromptSpec,
  after: PromptSpec
): { changes: SpecFieldChange[]; changedSections: number } {
  const changes: SpecFieldChange[] = [];
  for (const section of DIFF_ORDER) {
    const from = sectionText(before, section);
    const to = sectionText(after, section);
    if (from === null && to === null) continue;
    const status: SpecFieldChange["status"] =
      from === to
        ? "unchanged"
        : from === null
          ? "added"
          : to === null
            ? "removed"
            : "changed";
    changes.push({
      section,
      label: SECTION_LABELS[section],
      status,
      before: from,
      after: to,
    });
  }
  return {
    changes,
    changedSections: changes.filter((change) => change.status !== "unchanged")
      .length,
  };
}

/** Convenience: diff two prompt bodies without parsing them by hand. */
export function diffPromptContent(before: string, after: string) {
  return diffSpecs(parseSpec(before), parseSpec(after));
}
