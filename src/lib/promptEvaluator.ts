/**
 * Scores a prompt against the shape the catalog holds every prompt to.
 *
 * This used to reverse-engineer structure with regexes over the raw text —
 * `/\b(act as|role|you are)\b/` for a role, `content.length >= 120` for
 * clarity. It now reads the parsed spec, so "no output format" means the
 * section is genuinely absent rather than that a keyword was missing, and the
 * recommendations can name the section to add.
 */

import { extractVariables, renderPrompt } from "./variables";
import {
  missingCoreSections,
  parseSpec,
  presentSections,
  SECTION_LABELS,
  structureScore,
  type PromptSpec,
  type SpecSectionKey,
} from "./promptSpec";

export type EvaluationCriterion = {
  key: "clarity" | "specificity" | "safety" | "completeness" | "consistency";
  label: string;
  score: number;
  detail: string;
};

export type PromptEvaluation = {
  score: number;
  verdict: "Ready" | "Worth refining" | "Needs work";
  criteria: EvaluationCriterion[];
  strengths: string[];
  recommendations: string[];
  /** The parsed structure the score was derived from. */
  spec: PromptSpec;
  structure: {
    score: number;
    present: SpecSectionKey[];
    missing: SpecSectionKey[];
  };
  test: {
    variableCount: number;
    filledVariables: string[];
    missingVariables: string[];
    renderedPrompt: string;
    expectedSections: string[];
    sampleOutputCoverage?: number;
    missingOutputSections?: string[];
  };
};

function has(content: string, pattern: RegExp) {
  return pattern.test(content);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function criterion(
  key: EvaluationCriterion["key"],
  label: string,
  score: number,
  detail: string
): EvaluationCriterion {
  return { key, label, score: clamp(score), detail };
}

export function evaluatePrompt(
  content: string,
  values: Record<string, string> = {},
  sampleOutput = ""
): PromptEvaluation {
  const lower = content.toLowerCase();
  const spec = parseSpec(content);
  const variables = extractVariables(content);
  const filledVariables = variables.filter((name) => values[name]?.trim());
  const missingVariables = variables.filter((name) => !values[name]?.trim());

  // The output section *is* the list of sections the answer must contain.
  const expectedSections = spec.output;
  const present = presentSections(spec);
  const missing = missingCoreSections(spec);

  const clarityScore =
    (spec.objective ? 45 : 0) +
    (spec.role ? 25 : 0) +
    (spec.objective && spec.objective.length <= 400 ? 15 : 0) +
    (spec.preamble && present.length === 0 ? 20 : 0) +
    (content.length >= 80 ? 15 : 0);

  const specificityScore =
    20 +
    Math.min(30, spec.context.length * 10) +
    Math.min(20, variables.length * 7) +
    (spec.process.length >= 3 ? 20 : spec.process.length > 0 ? 10 : 0) +
    (spec.specialisation ? 10 : 0);

  const safetyScore =
    30 +
    (spec.guardrails ? 30 : 0) +
    (spec.constraints.length > 0 ? 15 : 0) +
    (has(lower, /\b(do not|never|avoid|must not)\b/) ? 10 : 0) +
    (has(lower, /\b(assumptions?|uncertain|unknown|missing information)\b/)
      ? 10
      : 0) +
    (has(lower, /\b(untrusted|source|evidence|invent|privacy|sensitive)\b/)
      ? 5
      : 0);

  const completenessScore = structureScore(spec);

  let consistencyScore =
    15 +
    (spec.output.length > 0 ? 45 : 0) +
    (spec.output.length >= 3 ? 15 : 0) +
    (has(lower, /\b(exactly|schema|table|json|markdown|numbered|checklist)\b/)
      ? 15
      : 0) +
    (has(lower, /\b(concise|length|words?|characters?|items?)\b/) ? 10 : 0);

  let sampleOutputCoverage: number | undefined;
  let missingOutputSections: string[] | undefined;
  if (sampleOutput.trim() && expectedSections.length > 0) {
    missingOutputSections = expectedSections.filter((section) => {
      const keywords = section
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .slice(0, 3);
      return (
        keywords.length > 0 &&
        !keywords.some((word) => sampleOutput.toLowerCase().includes(word))
      );
    });
    sampleOutputCoverage = Math.round(
      ((expectedSections.length - missingOutputSections.length) /
        expectedSections.length) *
        100
    );
    consistencyScore = Math.round((consistencyScore + sampleOutputCoverage) / 2);
  }

  const criteria = [
    criterion(
      "clarity",
      "Clarity",
      clarityScore,
      "A stated role and one explicit objective."
    ),
    criterion(
      "specificity",
      "Specificity",
      specificityScore,
      "Named context fields, variables and concrete steps."
    ),
    criterion(
      "safety",
      "Safety",
      safetyScore,
      "Boundaries for uncertainty, evidence and untrusted material."
    ),
    criterion(
      "completeness",
      "Completeness",
      completenessScore,
      "Role, objective, context, process and output all present."
    ),
    criterion(
      "consistency",
      "Output consistency",
      consistencyScore,
      "A repeatable and testable response structure."
    ),
  ];
  const score = clamp(
    criteria.reduce((sum, item) => sum + item.score, 0) / criteria.length
  );

  const strengths = criteria
    .filter((item) => item.score >= 80)
    .map((item) => `${item.label}: ${item.detail}`);

  const recommendations: string[] = [];
  // Naming the absent section beats "add more specificity".
  for (const section of missing) {
    switch (section) {
      case "role":
        recommendations.push(
          'Open with "Act as …" so the model adopts a specific expert role.'
        );
        break;
      case "objective":
        recommendations.push(
          'Add an "Objective" section stating the one outcome you want.'
        );
        break;
      case "context":
        recommendations.push(
          'Add a "Context I am giving you" section listing each input as "Label: {{placeholder}}".'
        );
        break;
      case "process":
        recommendations.push(
          'Add a "Process" section with the steps to work through in order.'
        );
        break;
      case "output":
        recommendations.push(
          'Add a "Return exactly" section naming every part the answer must contain.'
        );
        break;
      default:
        recommendations.push(`Add a ${SECTION_LABELS[section]} section.`);
    }
  }
  if (!spec.guardrails && missing.length < 3) {
    recommendations.push(
      'Add a "Before you begin" section telling the model how to handle missing detail and unverified claims.'
    );
  }
  if (spec.preamble && present.length > 0) {
    recommendations.push(
      "Some text sits outside any section — fold it into the objective or the context so the structure covers the whole prompt."
    );
  }
  if (missingVariables.length > 0) {
    recommendations.push(
      `Fill ${missingVariables.length} test variable${missingVariables.length === 1 ? "" : "s"} before running the prompt.`
    );
  }
  if (missingOutputSections?.length) {
    recommendations.push(
      `The sample output appears to miss: ${missingOutputSections.join(", ")}.`
    );
  }

  return {
    score,
    verdict: score >= 80 ? "Ready" : score >= 60 ? "Worth refining" : "Needs work",
    criteria,
    strengths,
    recommendations,
    spec,
    structure: { score: completenessScore, present, missing },
    test: {
      variableCount: variables.length,
      filledVariables,
      missingVariables,
      renderedPrompt: renderPrompt(content, values),
      expectedSections,
      sampleOutputCoverage,
      missingOutputSections,
    },
  };
}
