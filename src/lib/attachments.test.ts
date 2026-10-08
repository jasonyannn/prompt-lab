import { describe, expect, it } from "vitest";
import { attachmentContext, type UserAttachment } from "./attachments";

function doc(name: string, length: number): UserAttachment {
  return {
    id: name,
    name,
    mimeType: "text/plain",
    size: length,
    lastModified: 0,
    kind: "document",
    text: name[0].repeat(length),
  };
}

describe("attachmentContext", () => {
  it("returns an empty string with no attachments", () => {
    expect(attachmentContext([])).toBe("");
  });

  it("keeps a short document whole even after a long one", () => {
    const context = attachmentContext([doc("long.txt", 50_000), doc("short.txt", 500)], 10_000);
    expect(context).toContain("s".repeat(500));
    expect(context).toContain("BEGIN ATTACHED DOCUMENT: long.txt");
    expect(context).toContain("[Additional attachment content omitted to fit the context limit]");
  });

  it("splits the budget between long documents instead of starving the second", () => {
    const context = attachmentContext([doc("alpha.txt", 50_000), doc("beta.txt", 50_000)], 10_000);
    const alpha = (context.match(/a/g) ?? []).length;
    const beta = (context.match(/b/g) ?? []).length;
    expect(beta).toBeGreaterThan(3_000);
    expect(Math.abs(alpha - beta)).toBeLessThan(200);
    expect(context.length).toBeLessThanOrEqual(10_300);
  });

  it("does not mark a document as omitted when everything fits", () => {
    const context = attachmentContext([doc("a.txt", 100)]);
    expect(context).not.toContain("omitted");
  });

  it("lists images by name without inlining them", () => {
    const image: UserAttachment = {
      id: "i",
      name: "shot.png",
      mimeType: "image/png",
      size: 2048,
      lastModified: 0,
      kind: "image",
      base64: "xxxx",
    };
    expect(attachmentContext([image])).toBe("[Attached image: shot.png · image/png · 2 KB]");
  });
});
