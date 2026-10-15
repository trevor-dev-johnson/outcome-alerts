import { describe, expect, it } from "vitest";
import OpenGraphImage, { alt, contentType, size } from "./opengraph-image";

describe("default social image", () => {
  it("returns a large opaque PNG response with accurate product metadata", async () => {
    const response = OpenGraphImage();
    const image = await response.arrayBuffer();

    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("Telegram probability alerts");
    expect(alt).toContain("Hyperliquid HIP-4");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(image.byteLength).toBeGreaterThan(10_000);
  });
});
