import { describe, expect, it } from "vitest";
import { normalizeUsername } from "./username";

describe("username validation", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeUsername("  Jason_Yan26  ")).toBe("jason_yan26");
  });

  it.each(["", "ab", "a".repeat(25), "first last", "@jason", "a.b", "jason/yan", "<script>", "用户名称"])("rejects invalid handle %j", (value) => {
    expect(() => normalizeUsername(value)).toThrow("Use 3–24");
  });

  it.each(["abc", "a".repeat(24), "abc_123"])("accepts valid handle %j", (value) => {
    expect(normalizeUsername(value)).toBe(value);
  });
});
