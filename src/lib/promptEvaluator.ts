import { extractVariables, renderPrompt } from "./variables";

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

function extractExpectedSections(content: string) {
  const marker = content.match(
    /(?:return exactly|output format|include(?: the following)?)[^\n]*\n([\s\S]*?)(?:\n\n|$)/i
  );
  if (!marker?.[1]) return [];
  return marker[1]
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length >= 3)
    .slice(0, 12);
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
  const variables = extractVariables(content);
  const filledVariables = variables.filter((name) => values[name]?.trim());
  const missingVariables = variables.filter((name) => !values[name]?.trim());
  const expectedSections = extractExpectedSections(content);

  const clarityScore =
    35 +
    (has(lower, /\b(objective|goal|task|create|analyse|analyze|design|write)\b/) ? 30 : 0) +
    (content.length >= 120 ? 20 : 0) +
    (content.length <= 8_000 ? 15 : 0);

  const specificityScore =
    20 +
    (has(lower, /\b(context|audience|user|platform|constraints?|inputs?|source material)\b/) ? 30 : 0) +
    (variables.length > 0 ? 25 : 0) +
    (has(content, /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/m) ? 25 : 0);

  const safetyScore =
    30 +
    (has(lower, /\b(do not|never|avoid|must not)\b/) ? 25 : 0) +
    (has(lower, /\b(assumptions?|uncertain|unknown|missing information)\b/) ? 20 : 0) +
    (has(lower, /\b(untrusted|source|evidence|invent|privacy|sensitive)\b/) ? 25 : 0);

  const completenessScore =
    10 +
    (has(lower, /\b(act as|role|you are)\b/) ? 20 : 0) +
    (has(lower, /\b(context|background|known)\b/) ? 20 : 0) +
    (has(lower, /\b(process|steps?|first|then)\b/) ? 25 : 0) +
    (has(lower, /\b(return|output|format|deliverable)\b/) ? 25 : 0);

  let consistencyScore =
    20 +
    (expectedSections.length > 0 ? 45 : 0) +
    (has(lower, /\b(exactly|schema|table|json|markdown|numbered|checklist)\b/) ? 20 : 0) +
    (has(lower, /\b(concise|length|words?|characters?|items?)\b/) ? 15 : 0);

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
      return keywords.length > 0 && !keywords.some((word) => sampleOutput.toLowerCase().includes(word));
    });
    sampleOutputCoverage = Math.round(
      ((expectedSections.length - missingOutputSections.length) / expectedSections.length) * 100
    );
    consistencyScore = Math.round((consistencyScore + sampleOutputCoverage) / 2);
  }

  const criteria = [
    criterion("clarity", "Clarity", clarityScore, "A direct task and understandable objective."),
    criterion("specificity", "Specificity", specificityScore, "Useful context, inputs and concrete constraints."),
    criterion("safety", "Safety", safetyScore, "Boundaries for uncertainty, evidence and untrusted material."),
    criterion("completeness", "Completeness", completenessScore, "Role, context, process and deliverable coverage."),
    criterion("consistency", "Output consistency", consistencyScore, "A repeatable and testable response structure."),
  ];
  const score = clamp(
    criteria.reduce((sum, item) => sum + item.score, 0) / criteria.length
  );

  const strengths = criteria
    .filter((item) => item.score >= 80)
    .map((item) => `${item.label}: ${item.detail}`);
  const recommendations: string[] = [];
  if (clarityScore < 80) recommendations.push("State one explicit objective using a concrete action verb.");
  if (specificityScore < 80) recommendations.push("Add audience, available inputs, constraints, and variables for changing context.");
  if (safetyScore < 80) recommendations.push("Tell the model how to handle uncertainty, unsupported claims, and untrusted source material.");
  if (completenessScore < 80) recommendations.push("Specify the role, known context, process, and required deliverable.");
  if (consistencyScore < 80) recommendations.push("Define an exact output format with named sections or a schema.");
  if (missingVariables.length > 0) recommendations.push(`Fill ${missingVariables.length} test variable${missingVariables.length === 1 ? "" : "s"} before running the prompt.`);
  if (missingOutputSections?.length) recommendations.push(`The sample output appears to miss: ${missingOutputSections.join(", ")}.`);

  return {
    score,
    verdict: score >= 80 ? "Ready" : score >= 60 ? "Worth refining" : "Needs work",
    criteria,
    strengths,
    recommendations,
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
