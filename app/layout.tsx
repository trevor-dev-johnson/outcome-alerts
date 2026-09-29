import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://oddsup.xyz"),
  applicationName: "oddsUp",
  title: { default: "oddsUp — Hyperliquid Prediction Market Alerts", template: "%s · oddsUp" },
  description: "Track Hyperliquid prediction markets and get Telegram alerts when probabilities cross your chosen threshold. Choose a market, set an alert, and stay informed.",
  openGraph: {
    type: "website",
    siteName: "oddsUp",
    url: "https://oddsup.xyz",
    locale: "en_US",
    title: "oddsUp — Prediction market alerts. Delivered to Telegram.",
    description: "Track Hyperliquid outcome markets. Set your probability threshold and get notified on Telegram when it crosses.",
    images: [{ url: "/brand/social-card-v1.png", width: 1200, height: 630, alt: "oddsUp: Prediction market alerts. Delivered to Telegram. Hyperliquid outcome markets." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "oddsUp — Prediction market alerts. Delivered to Telegram.",
    description: "Your market. Your threshold. Your alert. Probability alerts for Hyperliquid outcome markets.",
    images: [{ url: "/brand/social-card-v1.png", alt: "oddsUp: Prediction market alerts. Delivered to Telegram." }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
