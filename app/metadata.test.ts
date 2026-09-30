import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import robots from "./robots";
import sitemap from "./sitemap";
import { aboutJsonLd, homeJsonLd, SITE_URL } from "@/lib/site";

describe("public metadata", () => {
  it("indexes only the public pages", () => {
    expect(sitemap()).toEqual([
      expect.objectContaining({ url: `${SITE_URL}/`, priority: 1 }),
      expect.objectContaining({ url: `${SITE_URL}/about`, priority: 0.8 }),
    ]);
    const policy = robots();
    expect(policy.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(policy.rules).toEqual(expect.objectContaining({
      userAgent: "*",
      allow: "/",
      disallow: expect.arrayContaining(["/alerts", "/login", "/markets", "/settings"]),
    }));
  });

  it("provides installable application identity", () => {
    const siteManifest = manifest();
    expect(siteManifest.start_url).toBe("/");
    expect(siteManifest.display).toBe("standalone");
    expect(siteManifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
    ]));
  });

  it("uses truthful WebSite and WebApplication structured data", () => {
    expect(() => JSON.parse(JSON.stringify(homeJsonLd))).not.toThrow();
    expect(homeJsonLd["@graph"].map((entry) => entry["@type"])).toEqual([
      "WebSite",
      "WebApplication",
    ]);
    expect(JSON.stringify(homeJsonLd)).not.toContain("user");
  });

  it("describes the about route without duplicating the site graph", () => {
    expect(aboutJsonLd).toEqual(expect.objectContaining({
      "@type": "AboutPage",
      url: `${SITE_URL}/about`,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#application` },
    }));
  });
});
