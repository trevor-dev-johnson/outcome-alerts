export const SITE_URL = "https://oddsup.xyz";
export const SITE_NAME = "oddsUp";
export const SITE_TITLE = "oddsUp — Prediction market alerts";
export const SITE_DESCRIPTION =
  "Monitor Hyperliquid prediction markets and receive Telegram alerts when market probabilities cross your thresholds.";

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#application`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern web browser",
      featureList: [
        "Monitor Hyperliquid prediction markets",
        "Create probability threshold alerts",
        "Receive alert notifications on Telegram",
      ],
    },
  ],
};

export const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${SITE_URL}/about#page`,
  url: `${SITE_URL}/about`,
  name: "About oddsUp | Hyperliquid HIP-4 Market Alerts",
  description:
    "Learn how oddsUp monitors Hyperliquid HIP-4 outcome markets and sends Telegram alerts when market probabilities cross the thresholds you set.",
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@id": `${SITE_URL}/#application` },
  inLanguage: "en",
};
