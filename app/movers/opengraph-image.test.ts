import { describe, expect, it } from "vitest";
import MoversOpenGraphImage, { alt, contentType, size } from "./opengraph-image";

describe("Movers social image", () => {
  it("returns a large opaque PNG response with descriptive metadata", async () => {
    const response = MoversOpenGraphImage();
    const image = await response.arrayBuffer();

    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toContain("HIP-4 Movers");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(image.byteLength).toBeGreaterThan(10_000);
  });
});
