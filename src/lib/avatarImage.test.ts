import { describe, expect, it } from "vitest";
import { cropRect, defaultCrop, MAX_ZOOM } from "./avatarImage";

describe("cropRect", () => {
  it("starts as the largest centred square", () => {
    const rect = cropRect(1200, 800, defaultCrop(1200, 800));
    expect(rect).toMatchObject({ side: 800, x: 200, y: 0 });
  });

  it("shrinks the square as the photo is zoomed in", () => {
    const rect = cropRect(1000, 1000, { zoom: 2, centerX: 500, centerY: 500 });
    expect(rect).toMatchObject({ side: 500, x: 250, y: 250 });
  });

  it("keeps the crop inside the photo when panned past an edge", () => {
    const rect = cropRect(1000, 1000, { zoom: 2, centerX: -50, centerY: 5000 });
    expect(rect.x).toBe(0);
    expect(rect.y + rect.side).toBe(1000);
  });

  it("clamps zoom to the supported range", () => {
    expect(cropRect(1000, 1000, { zoom: 99, centerX: 500, centerY: 500 }).zoom).toBe(MAX_ZOOM);
    expect(cropRect(1000, 1000, { zoom: 0.2, centerX: 500, centerY: 500 }).zoom).toBe(1);
  });
});
