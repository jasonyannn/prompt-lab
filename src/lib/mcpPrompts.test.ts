import { describe, expect, it } from "vitest";
import {
  argumentName,
  compilePrompt,
  fillFromArguments,
  promptArguments,
  promptDescription,
  promptSlug,
  EXPORT_TARGETS,
  type ExportTarget,
} from "./mcpPrompts";

const PROMPT = `Act as a recruiter.

Objective
Write a cover letter that survives a first screen.

Context I am giving you
- The role you are applying for: {{the role you are applying for}}
- Your strongest evidence: {{your strongest evidence}}

Return exactly
- A three paragraph letter`;

describe("promptSlug", () => {
  it("makes a readable command name from a title", () => {
    expect(promptSlug("Cover letter — UX Designer")).toBe(
      "cover-letter-ux-designer"
    );
    expect(promptSlug("PRD Writer")).toBe("prd-writer");
    expect(promptSlug("What's next?")).toBe("whats-next");
  });

  it("keeps names unique within one server", () => {
    const taken = new Set<string>();
    expect(promptSlug("Audit", taken)).toBe("audit");
    expect(promptSlug("Audit", taken)).toBe("audit-2");
    expect(promptSlug("Audit", taken)).toBe("audit-3");
  });

  it("never returns an empty name", () => {
    expect(promptSlug("!!!")).toBe("prompt");
  });
});

describe("argumentName", () => {
  it("converts a placeholder into a safe argument name", () => {
    expect(argumentName("the role you are applying for")).toBe(
      "the_role_you_are_applying_for"
    );
    expect(argumentName("What you sell!")).toBe("what_you_sell");
  });
});

describe("promptArguments", () => {
  it("describes each argument with its context label", () => {
    const args = promptArguments(PROMPT);

    expect(args).toHaveLength(2);
    expect(args[0]).toMatchObject({
      name: "the_role_you_are_applying_for",
      variable: "the role you are applying for",
      description: "The role you are applying for.",
      required: false,
    });
  });

  it("falls back to the placeholder when there is no context line", () => {
    const args = promptArguments("Summarise {{topic}} in one page.");

    expect(args[0].description).toBe('Value for "topic".');
  });

  it("does not collide when two placeholders normalise the same way", () => {
    const args = promptArguments("{{a b}} and {{a-b}}");

    expect(args.map((argument) => argument.name)).toEqual(["a_b", "a_b_2"]);
  });
});

describe("fillFromArguments", () => {
  it("maps argument names back onto placeholders", () => {
    const args = promptArguments(PROMPT);
    const filled = fillFromArguments(PROMPT, args, {
      the_role_you_are_applying_for: "Staff Engineer",
    });

    expect(filled.text).toContain("The role you are applying for: Staff Engineer");
    expect(filled.filled).toEqual(["the_role_you_are_applying_for"]);
    expect(filled.missing).toEqual(["your_strongest_evidence"]);
  });

  it("leaves an unfilled placeholder visible rather than blanking it", () => {
    const args = promptArguments(PROMPT);
    const filled = fillFromArguments(PROMPT, args, {});

    expect(filled.text).toContain("{{your strongest evidence}}");
  });
});

describe("promptDescription", () => {
  it("uses the objective when the prompt has one", () => {
    expect(promptDescription(PROMPT)).toBe(
      "Write a cover letter that survives a first screen."
    );
  });

  it("falls back to the first line of an unstructured prompt", () => {
    expect(promptDescription("Draft a launch email.\nKeep it short.")).toBe(
      "Draft a launch email."
    );
  });
});

describe("compilePrompt", () => {
  const prompt = { title: "Cover letter", content: PROMPT, category: "Career" };

  it("produces a file for every advertised target", () => {
    for (const target of EXPORT_TARGETS) {
      const file = compilePrompt(prompt, target.id);
      expect(file.body.length, `${target.id} produced no body`).toBeGreaterThan(0);
      expect(file.filename).toContain("cover-letter");
    }
  });

  it("writes a prompt file with front matter", () => {
    const file = compilePrompt(prompt, "prompt-md");

    expect(file.filename).toBe("cover-letter.prompt.md");
    expect(file.body.startsWith("---\ndescription: ")).toBe(true);
    expect(file.body).toContain("Act as a recruiter.");
  });

  it("writes a skill with a name that matches its directory", () => {
    const file = compilePrompt(prompt, "claude-skill");

    expect(file.filename).toBe("cover-letter/SKILL.md");
    expect(file.body).toContain("name: cover-letter");
  });

  it("emits the structured spec as JSON, not just the text", () => {
    const file = compilePrompt(prompt, "json-spec");
    const parsed = JSON.parse(file.body);

    expect(parsed.spec.role).toBe("a recruiter");
    expect(parsed.spec.output).toEqual(["A three paragraph letter"]);
    expect(parsed.spec.context).toHaveLength(2);
  });

  it("emits an MCP prompt definition a client could register", () => {
    const file = compilePrompt(prompt, "mcp-prompt");
    const parsed = JSON.parse(file.body);

    expect(parsed.name).toBe("cover-letter");
    expect(parsed.arguments.map((a: { name: string }) => a.name)).toEqual([
      "the_role_you_are_applying_for",
      "your_strongest_evidence",
    ]);
  });

  it("escapes a quote in a description rather than breaking the front matter", () => {
    const file = compilePrompt(
      { title: "Quoted", content: 'Objective\nWrite a "good" thing.' },
      "cursor-rule"
    );

    expect(file.body).toContain('description: "Write a \\"good\\" thing."');
  });

  it("falls back to markdown for an unknown target", () => {
    const file = compilePrompt(prompt, "nonsense" as ExportTarget);

    expect(file.body.startsWith("# Cover letter")).toBe(true);
  });
});
