/** Handles have one canonical spelling, shared with the database constraint. */
export function normalizeUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error("Use 3–24 letters, numbers, or underscores for your username.");
  }
  return username;
}
