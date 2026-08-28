/**
 * Prompts may contain {{placeholders}}. Both humans and agents fill them in
 * before the prompt is used.
 */

const TOKEN = /\{\{\s*([a-zA-Z0-9_ -]+?)\s*\}\}/g;

/** Unique placeholder names, in the order they first appear. */
export function extractVariables(content: string): string[] {
  const found: string[] = [];
  for (const match of content.matchAll(TOKEN)) {
    const name = match[1].trim();
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

/** Substitutes values; unfilled placeholders are left visible on purpose. */
export function renderPrompt(
  content: string,
  values: Record<string, string>
): string {
  return content.replace(TOKEN, (whole, rawName: string) => {
    const name = rawName.trim();
    const value = values[name];
    return value !== undefined && value !== "" ? value : whole;
  });
}

export function missingVariables(
  content: string,
  values: Record<string, string>
): string[] {
  return extractVariables(content).filter(
    (name) => !values[name] || values[name].trim() === ""
  );
}
