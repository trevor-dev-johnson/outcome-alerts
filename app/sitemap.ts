import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the public landing page is indexable; markets currently require sign-in.
  return [{ url: "https://oddsup.xyz" }];
}
