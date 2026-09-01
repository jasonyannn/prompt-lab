import { describe, expect, it } from "vitest";
import { extractPromptCandidates, replyOffersPrompts } from "./promptExtraction";

/** The shape gpt-5.2 actually returns when it lists prompts instead of calling the tool. */
const NUMBERED_REPLY = `Here are three prompts for your design AI app:

1) **Accessibility & heuristic critique**
Act as a senior accessibility specialist. Review the attached interface for WCAG issues, usability heuristics and cognitive load, then rank the findings by user impact and give a specific fix for each.

2) **Consistency & design QA**
Act as a design systems reviewer. Check the screens for component reuse, spacing consistency, naming and platform guideline compliance, and list every deviation with the correct pattern.

3) **Handoff pack generator**
Act as a design technologist. Turn the final screens into dev-ready specs: component props, states, acceptance criteria, analytics events and edge cases.

Want me to save any of these?`;

const FENCED_REPLY = `Sure — here are two:

### Opener Writer
\`\`\`
Act as a dating coach who writes openers that sound like a real person.
Context I am giving you
- Their profile: {{their profile}}
Return exactly three openers.
\`\`\`

### Profile Reviewer
\`\`\`
Act as a profile editor. Review my dating profile for clarity, specificity and
what it signals. Give three concrete rewrites.
\`\`\``;

const QUESTIONS_REPLY = `Great — a few questions first:

1) Who are your target users and what outcome do you promise?

2) What inputs will your app have available: a text brief, brand tokens, screenshots?

3) What outputs do you want to standardise: UI copy, wireframes, or a UX audit?`;

describe("extractPromptCandidates", () => {
  it("pulls each numbered prompt out of a written reply", () => {
    const found = extractPromptCandidates(NUMBERED_REPLY);
    expect(found).toHaveLength(3);
    expect(found.map((c) => c.title)).toEqual([
      "Accessibility & heuristic critique",
      "Consistency & design QA",
      "Handoff pack generator",
    ]);
  });

  it("keeps the prompt body with its title", () => {
    const [first] = extractPromptCandidates(NUMBERED_REPLY);
    expect(first.content).toContain("Act as a senior accessibility specialist");
    expect(first.content).not.toContain("Consistency & design QA");
  });

  it("reads fenced code blocks as the prompt body", () => {
    const found = extractPromptCandidates(FENCED_REPLY);
    expect(found).toHaveLength(2);
    expect(found[0].title).toBe("Opener Writer");
    expect(found[0].content).toContain("{{their profile}}");
    expect(found[0].content).not.toContain("```");
  });

  it("does not treat clarifying questions as prompts", () => {
    expect(extractPromptCandidates(QUESTIONS_REPLY)).toHaveLength(0);
    expect(replyOffersPrompts(QUESTIONS_REPLY)).toBe(false);
  });

  it("ignores headings with no substantial body", () => {
    const thin = `1) **Idea one**\nshort\n\n2) **Idea two**\nalso short`;
    expect(extractPromptCandidates(thin)).toHaveLength(0);
  });

  it("returns nothing for plain prose", () => {
    expect(
      extractPromptCandidates("I saved that prompt to your library for you.")
    ).toHaveLength(0);
  });

  it("handles an empty message", () => {
    expect(extractPromptCandidates("")).toHaveLength(0);
    expect(extractPromptCandidates("   \n  ")).toHaveLength(0);
  });

  it("gives every candidate a stable id", () => {
    const found = extractPromptCandidates(NUMBERED_REPLY);
    expect(new Set(found.map((c) => c.id)).size).toBe(found.length);
    expect(extractPromptCandidates(NUMBERED_REPLY).map((c) => c.id)).toEqual(
      found.map((c) => c.id)
    );
  });

  it("reports whether a reply offers anything saveable", () => {
    expect(replyOffersPrompts(NUMBERED_REPLY)).toBe(true);
    expect(replyOffersPrompts(FENCED_REPLY)).toBe(true);
    expect(replyOffersPrompts("No prompts here, just chatting.")).toBe(false);
  });
});
