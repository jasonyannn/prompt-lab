import type { PromptAgent } from "./agentStore";

export type PromptTemplateId = "app" | "design" | "research" | "content";

export type PromptTemplate = {
  id: PromptTemplateId;
  name: string;
  description: string;
  eyebrow: string;
};

export type PromptBrief = {
  idea: string;
  audience: string;
  platform: string;
  sourceData: string;
  constraints: string;
  templateId: PromptTemplateId;
};

export type GeneratedPrompt = {
  localId: string;
  title: string;
  content: string;
  category: string;
};

type PromptRecipe = {
  suffix: string;
  objective: string;
  steps: string[];
  output: string[];
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "app",
    name: "Build an app",
    eyebrow: "Idea → MVP",
    description: "Strategy, user flow, build brief and pre-launch critique.",
  },
  {
    id: "design",
    name: "Design a product",
    eyebrow: "Brief → UI",
    description: "Creative direction, experience map, screen brief and UX audit.",
  },
  {
    id: "research",
    name: "Run research",
    eyebrow: "Question → Insight",
    description: "Research plan, interview guide, synthesis and decision memo.",
  },
  {
    id: "content",
    name: "Create content",
    eyebrow: "Message → Campaign",
    description: "Positioning, content system, production prompt and editor pass.",
  },
];

const RECIPES: Record<PromptTemplateId, PromptRecipe[]> = {
  app: [
    {
      suffix: "Product Blueprint",
      objective: "Turn the idea into a focused product definition before anything is built.",
      steps: [
        "Restate the problem in one sentence and identify the highest-pain user job.",
        "Separate assumptions from facts and flag the three riskiest assumptions.",
        "Define the smallest coherent MVP and explicitly list what is out of scope.",
        "Propose success signals that can be observed in the first 30 days.",
      ],
      output: ["Problem statement", "Primary persona", "Core job", "MVP scope", "Risks", "Success metrics"],
    },
    {
      suffix: "User Flow",
      objective: "Design the shortest understandable path from first visit to the core outcome.",
      steps: [
        "Map entry points, the happy path and the moment the user first receives value.",
        "Include empty, loading, error and recovery states.",
        "Name the information and decisions required at every step.",
        "Remove steps that do not directly increase trust or move the user forward.",
      ],
      output: ["Flow overview", "Numbered screens", "State table", "Key microcopy", "Open UX questions"],
    },
    {
      suffix: "Build Brief",
      objective: "Produce an implementation-ready brief that another AI coding tool can follow.",
      steps: [
        "Translate the product into pages, components, data entities and user actions.",
        "Specify behaviour, validation and responsive rules—not just appearance.",
        "Recommend a simple architecture and explain any important trade-offs.",
        "Break delivery into testable milestones, starting with a vertical slice.",
      ],
      output: ["Feature requirements", "Page map", "Component inventory", "Data model", "Acceptance criteria", "Build order"],
    },
    {
      suffix: "Pre-launch Critique",
      objective: "Stress-test the proposed experience before it reaches users.",
      steps: [
        "Review usefulness, clarity, accessibility, trust and technical feasibility.",
        "Find missing states and places where a new user would hesitate.",
        "Rank findings by user impact and effort to fix.",
        "Recommend the five changes that most improve the launch version.",
      ],
      output: ["Executive verdict", "Issue table", "Launch blockers", "Quick wins", "Recommended next iteration"],
    },
  ],
  design: [
    {
      suffix: "Creative Direction",
      objective: "Translate the product idea into a distinctive and usable visual direction.",
      steps: [
        "Derive three design principles from the audience and desired outcome.",
        "Define typography, colour, spacing, imagery and motion behaviour in practical terms.",
        "Explain how the direction should feel without relying on vague style words.",
        "Call out visual clichés to avoid.",
      ],
      output: ["Design principles", "Visual system", "Interaction character", "Do / don't list", "Reference keywords"],
    },
    {
      suffix: "Experience Architecture",
      objective: "Create a clear information architecture and end-to-end interaction model.",
      steps: [
        "Identify the user's mental model and the objects they need to understand.",
        "Propose navigation, hierarchy and the primary task flow.",
        "Describe empty, loading, success, error and permission states.",
        "Check the flow for accessibility and narrow-screen use.",
      ],
      output: ["Information architecture", "Primary flow", "Screen inventory", "State coverage", "Accessibility notes"],
    },
    {
      suffix: "UI Generation Brief",
      objective: "Give a design or code generation AI enough direction to create the key interface.",
      steps: [
        "Describe the exact screen, its user goal and its place in the journey.",
        "Specify layout zones, component hierarchy and interaction behaviour.",
        "Use realistic content and data rather than placeholder lorem ipsum.",
        "Include responsive behaviour and visual acceptance criteria.",
      ],
      output: ["Screen goal", "Layout specification", "Component states", "Sample content", "Responsive rules", "Quality checklist"],
    },
    {
      suffix: "Design Critique",
      objective: "Critique an interface constructively and turn findings into precise revisions.",
      steps: [
        "Evaluate hierarchy, comprehension, interaction cost, accessibility and consistency.",
        "Tie every issue to evidence visible in the supplied material.",
        "Rank issues by severity and avoid cosmetic feedback unless it affects the experience.",
        "Describe the revised solution precisely enough to implement.",
      ],
      output: ["What works", "Prioritised findings", "Why each issue matters", "Specific revision", "Validation checklist"],
    },
  ],
  research: [
    {
      suffix: "Research Plan",
      objective: "Choose the leanest research approach that can answer the important decision.",
      steps: [
        "Convert the request into decision-oriented research questions.",
        "Recommend participants, method, sample size and recruitment criteria.",
        "Identify bias risks and what the study will not prove.",
        "Create a realistic schedule and evidence threshold for action.",
      ],
      output: ["Decision to inform", "Research questions", "Method", "Participants", "Timeline", "Decision criteria"],
    },
    {
      suffix: "Interview Guide",
      objective: "Create a neutral interview guide that surfaces behaviour rather than opinions.",
      steps: [
        "Start with recent real experiences and avoid leading or hypothetical questions.",
        "Use follow-up probes for motivation, workarounds, triggers and consequences.",
        "Sequence the guide from broad context to the specific problem.",
        "Add moderator notes and signals worth capturing.",
      ],
      output: ["Opening script", "Core questions", "Follow-up probes", "Closing questions", "Moderator checklist"],
    },
    {
      suffix: "Insight Synthesis",
      objective: "Turn raw observations into defensible themes and product implications.",
      steps: [
        "Separate direct evidence, interpretation and recommendation.",
        "Cluster repeated behaviours while preserving important contradictions.",
        "Quantify frequency only when the source data supports it.",
        "Connect every recommendation to a specific insight.",
      ],
      output: ["Evidence table", "Themes", "Tensions", "Opportunity areas", "Confidence notes"],
    },
    {
      suffix: "Decision Memo",
      objective: "Convert the research into a concise decision with explicit trade-offs.",
      steps: [
        "Summarise what changed in our understanding.",
        "Present viable options and compare them against agreed criteria.",
        "Recommend one action and name the evidence behind it.",
        "List remaining uncertainty and the cheapest next validation step.",
      ],
      output: ["Executive summary", "Evidence", "Options", "Recommendation", "Risks", "Next test"],
    },
  ],
  content: [
    {
      suffix: "Positioning",
      objective: "Find a sharp message that connects the offer to a real audience need.",
      steps: [
        "Define the audience's situation, struggle and desired progress.",
        "State the differentiated value without unsupported superlatives.",
        "Create a message hierarchy from core promise to proof points.",
        "Test the message against likely objections.",
      ],
      output: ["Audience insight", "Positioning statement", "Message hierarchy", "Proof points", "Objection responses"],
    },
    {
      suffix: "Content System",
      objective: "Design a repeatable content system rather than a one-off list of posts.",
      steps: [
        "Choose content pillars based on audience questions and business value.",
        "Define recurring formats and the job each format performs.",
        "Map a realistic publishing cadence and reuse path.",
        "Add quality signals and metrics for learning.",
      ],
      output: ["Content pillars", "Repeatable formats", "Channel plan", "Four-week calendar", "Learning metrics"],
    },
    {
      suffix: "Production Brief",
      objective: "Create one polished piece of content with a strong idea and specific execution.",
      steps: [
        "Select one audience tension and one intended response.",
        "Develop a concrete angle, hook and narrative progression.",
        "Use the supplied voice and source material; do not invent evidence.",
        "Create channel-appropriate copy and a clear call to action.",
      ],
      output: ["Concept", "Hook options", "Detailed outline", "Finished draft", "Alternate CTA"],
    },
    {
      suffix: "Editor Pass",
      objective: "Make supplied content clearer, more credible and more recognisable.",
      steps: [
        "Identify the single argument and remove anything that does not support it.",
        "Replace generic claims with specific evidence or mark them for sourcing.",
        "Improve rhythm, structure and voice without changing the intended meaning.",
        "Explain only the highest-impact edits.",
      ],
      output: ["Editorial diagnosis", "Revised version", "Key changes", "Claims needing evidence", "Final quality check"],
    },
  ],
};

function compactTitle(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 39).trim()}…`;
}

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function generatePromptPack(
  brief: PromptBrief,
  agent: PromptAgent
): GeneratedPrompt[] {
  const subject = compactTitle(brief.idea);
  const context = [
    `Product / topic: ${brief.idea}`,
    `Audience: ${brief.audience || "Ask me to define the primary audience before continuing."}`,
    `Target platform or tool: ${brief.platform || "Recommend the most suitable format or platform."}`,
    `Available inputs: ${brief.sourceData || "Ask what source material is available and clearly label any assumptions."}`,
    `Constraints: ${brief.constraints || "Prefer the smallest practical scope and state any assumptions."}`,
  ].join("\n");

  return RECIPES[brief.templateId].map((recipe, index) => ({
    localId: `${brief.templateId}-${index}`,
    title: `${subject} · ${recipe.suffix}`,
    category: agent.defaultCategory,
    content: `Act as ${agent.role}.\n\nWorking style\n${agent.instructions}\n\nObjective\n${recipe.objective}\n\nKnown context\n${context}\n\nSource material\n{{source material}}\n\nBefore you begin\nAsk up to 3 concise questions only if missing information would materially change the answer. Otherwise state reasonable assumptions and proceed. Never invent research, user quotes or product facts.\n\nProcess\n${list(recipe.steps)}\n\nReturn exactly\n${list(recipe.output)}\n\nMake the result specific to the known context, ready to use, and concise enough for a working team to act on.`,
  }));
}
