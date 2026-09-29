import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { homeJsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function Home() {
  return (
    <main className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd).replace(/</g, "\\u003c") }}
      />
      <header><div className="shell topbar-inner"><Brand /><nav className="nav" aria-label="Public navigation"><Link href="/about">About</Link><Link href="/login">Sign in</Link></nav></div></header>
      <div className="landing-main shell">
        <div className="landing-copy">
          <p className="eyebrow">Hyperliquid HIP-4 · Probability monitoring</p>
          <h1>odds<span>up.</span></h1>
          <div className="landing-bottom">
            <Link href="/login" className="btn btn-primary">Get started <ArrowUpRight size={16} /></Link>
            <p>Monitor prediction markets and get a Telegram alert the moment probability crosses your threshold.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
