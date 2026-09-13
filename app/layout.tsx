import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "oddsup", template: "%s · oddsup" },
  description: "Probability alerts for Hyperliquid outcome markets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
