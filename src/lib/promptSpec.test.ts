import { describe, expect, it } from "vitest";
import { getPrompts, renderCatalogPrompt } from "./catalog";
import {
  diffPromptContent,
  isCanonical,
  missingCoreSections,
  parseSpec,
  presentSections,
  renderSpec,
  structureScore,
} from "./promptSpec";

const CANONICAL = `Act as a senior product designer.

Objective
Audit an interface and rank what to fix first.

Context I am giving you
- What you are auditing: {{what you are auditing}}
- Who uses it: {{who uses it}}

Before you begin
State your assumptions rather than inventing facts.

Process
- Walk the primary task end to end
- Rank each issue by cost of leaving it

Return exactly
- A ranked issue table
- One recommended fix per issue

Keep the result short enough to act on today.`;

describe("parseSpec", () => {
  it("recovers every section of a canonical prompt", () => {
    const spec = parseSpec(CANONICAL);

    expect(spec.role).toBe("a senior product designer");
    expect(spec.objective).toBe(
      "Audit an interface and rank what to fix first."
    );
    expect(spec.context).toEqual([
      {
        label: "What you are auditing",
        placeholder: "what you are auditing",
        raw: "What you are auditing: {{what you are auditing}}",
      },
      {
        label: "Who uses it",
        placeholder: "who uses it",
        raw: "Who uses it: {{who uses it}}",
      },
    ]);
    expect(spec.guardrails).toBe(
      "State your assumptions rather than inventing facts."
    );
    expect(spec.process).toHaveLength(2);
    expect(spec.output).toEqual([
      "A ranked issue table",
      "One recommended fix per issue",
    ]);
    expect(spec.closing).toBe(
      "Keep the result short enough to act on today."
    );
    expect(spec.preamble).toBeNull();
  });

  it("keeps unstructured prose intact instead of dropping it", () => {
    const spec = parseSpec("Write me a poem about the sea.");

    expect(spec.preamble).toBe("Write me a poem about the sea.");
    expect(presentSections(spec)).toEqual([]);
    expect(renderSpec(spec)).toBe("Write me a poem about the sea.");
  });

  it("reads the master tier's Stages heading back as Stages", () => {
    const spec = parseSpec("Act as a planner.\n\nStages\n- One\n- Two");

    expect(spec.processHeading).toBe("Stages");
    expect(spec.process).toEqual(["One", "Two"]);
    expect(renderSpec(spec)).toContain("Stages\n- One\n- Two");
  });

  it("accepts the heading aliases a hand-written prompt uses", () => {
    const spec = parseSpec(
      "Goal\nShip the thing.\n\nSteps\n1. Plan\n2. Build\n\nOutput format\n* A checklist"
    );

    expect(spec.objective).toBe("Ship the thing.");
    expect(spec.process).toEqual(["Plan", "Build"]);
    expect(spec.output).toEqual(["A checklist"]);
  });
});

describe("renderSpec", () => {
  it("round-trips every prompt in the public catalog", () => {
    const specs = getPrompts();
    expect(specs.length).toBeGreaterThan(50);

    for (const catalogPrompt of specs) {
      const content = renderCatalogPrompt(catalogPrompt);
      expect(
        renderSpec(parseSpec(content)),
        `${catalogPrompt.id} did not round-trip`
      ).toBe(content);
    }
  });

  it("round-trips catalog role variants too", () => {
    const withVariants = getPrompts().filter((spec) => spec.variants);
    expect(withVariants.length).toBeGreaterThan(0);

    for (const catalogPrompt of withVariants) {
      for (const option of catalogPrompt.variants!.options) {
        const content = renderCatalogPrompt(catalogPrompt, option.id);
        expect(
          renderSpec(parseSpec(content)),
          `${catalogPrompt.id}:${option.id} did not round-trip`
        ).toBe(content);
      }
    }
  });

  it("reports canonical text as canonical and prose as not", () => {
    expect(isCanonical(CANONICAL)).toBe(true);
    expect(isCanonical("Objective\nDo it\n\n\n\nProcess\n-  Go")).toBe(false);
  });
});

describe("structureScore", () => {
  it("scores a full spec at 100 and bare prose at 0", () => {
    expect(structureScore(parseSpec(CANONICAL))).toBe(100);
    expect(structureScore(parseSpec("Just write something good."))).toBe(0);
  });

  it("names the core sections a prompt is missing", () => {
    const missing = missingCoreSections(parseSpec("Objective\nDo the thing."));
    expect(missing).toEqual(["role", "context", "process", "output"]);
  });
});

describe("diffPromptContent", () => {
  it("attributes a change to the section that moved", () => {
    const after = CANONICAL.replace(
      "- A ranked issue table",
      "- A ranked issue table with severities"
    );
    const { changes, changedSections } = diffPromptContent(CANONICAL, after);

    expect(changedSections).toBe(1);
    const changed = changes.filter((change) => change.status !== "unchanged");
    expect(changed[0].section).toBe("output");
    expect(changes.find((change) => change.section === "role")?.status).toBe(
      "unchanged"
    );
  });

  it("marks an added section as added rather than as edited lines", () => {
    const before = "Act as a writer.\n\nObjective\nWrite copy.";
    const after =
      "Act as a writer.\n\nObjective\nWrite copy.\n\nReturn exactly\n- One headline";
    const { changes } = diffPromptContent(before, after);

    expect(changes.find((change) => change.section === "output")?.status).toBe(
      "added"
    );
  });
});
