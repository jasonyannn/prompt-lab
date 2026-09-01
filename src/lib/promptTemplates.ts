export type PromptTemplateId =
  | "app"
  | "design"
  | "research"
  | "content"
  | "screenshot";

export type PromptTemplate = {
  id: PromptTemplateId;
  name: string;
  description: string;
  eyebrow: string;
  requiresImage?: boolean;
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
  {
    id: "screenshot",
    name: "Explore a screenshot",
    eyebrow: "Image → Interface",
    description: "Visual inventory, UX audit, reconstruction brief and redesign.",
    requiresImage: true,
  },
];
