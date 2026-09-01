import { getJourneys, getPrompts, getCategory } from "./catalog";
import { PROMPT_TEMPLATES } from "./promptTemplates";
import type { ProductRecord } from "./productSearch";

function searchable(parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Public catalog prompts, journeys and prompt-pack workflows. */
export function collectCatalogRecords(): ProductRecord[] {
  const records: ProductRecord[] = [];

  for (const spec of getPrompts()) {
    const categoryName = getCategory(spec.categoryId)?.name ?? spec.categoryId;
    records.push({
      id: spec.id,
      name: spec.title,
      description: spec.summary,
      category: categoryName,
      type: "prompt",
      searchText: searchable([
        spec.title,
        spec.summary,
        categoryName,
        spec.subcategoryId,
        spec.tier,
        spec.tags.join(" "),
        spec.objective,
        spec.role,
      ]),
    });
  }

  for (const journey of getJourneys()) {
    const categoryName = getCategory(journey.categoryId)?.name ?? journey.categoryId;
    records.push({
      id: journey.id,
      name: journey.name,
      description: journey.outcome,
      category: categoryName,
      type: "journey",
      searchText: searchable([
        journey.name,
        journey.outcome,
        journey.goal,
        categoryName,
        journey.steps.map((step) => step.note).join(" "),
      ]),
    });
  }

  for (const template of PROMPT_TEMPLATES) {
    records.push({
      id: `pack-${template.id}`,
      name: template.name,
      description: template.description,
      category: "Prompt pack",
      type: "prompt_pack",
      searchText: searchable([
        template.name,
        template.description,
        template.eyebrow,
        "prompt pack workflow",
      ]),
    });
  }

  return records;
}
