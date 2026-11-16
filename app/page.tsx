import Link from "next/link";
import { ArrowRight, ArrowUpRight, BellRing, Eye, Send } from "lucide-react";
import type { Metadata } from "next";
import { PublicNav } from "@/components/public-nav";
import { DEFAULT_SOCIAL_IMAGE, homeJsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/`,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export default function Home() {
  return (
    <main className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd).replace(/</g, "\\u003c") }}
      />
      <PublicNav />
      <section className="landing-main shell" aria-labelledby="home-title">
        <div className="landing-copy">
          <p className="eyebrow">Hyperliquid HIP-4 · Probability monitoring</p>
          <h1 id="home-title">odds<span>up.</span></h1>
          <h2>Know when probabilities cross your line.</h2>
          <p className="landing-intro">Browse live HIP-4 markets, choose a side and threshold, and get one Telegram alert when the crossing happens.</p>
          <div className="landing-actions">
            <Link href="/markets" className="btn btn-primary">Explore markets <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link href="/movers" className="btn btn-quiet">View movers <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ul className="landing-trust" aria-label="Product principles">
            <li>Free</li>
            <li>Watch-only</li>
            <li>Independent from Hyperliquid</li>
          </ul>
        </div>

        <aside className="landing-workflow" aria-label="How an oddsUp alert works">
          <div className="landing-workflow-head">
            <p className="eyebrow">One-shot alert workflow</p>
            <span className="status status-active">Monitoring</span>
          </div>
          <p className="landing-workflow-title">Choose any active HIP‑4 outcome market</p>
          <div className="landing-workflow-outcomes" aria-label="Available outcomes">
            <span><strong>YES</strong> Select a side</span>
            <span><strong>NO</strong> Select a side</span>
          </div>
          <div className="landing-workflow-rule">
            <BellRing size={18} aria-hidden="true" />
            <div><span className="eyebrow">Your rule</span><strong>Probability crosses your threshold</strong></div>
          </div>
          <div className="landing-workflow-delivery">
            <Send size={16} aria-hidden="true" />
            <span>Delivered to Telegram · no wallet connection</span>
          </div>
        </aside>
      </section>

      <section className="landing-support shell" aria-labelledby="how-it-works-title">
        <div className="landing-support-copy">
          <p className="eyebrow">From market to alert</p>
          <h2 id="how-it-works-title">Monitor the market. Keep control.</h2>
          <p>oddsUp watches public probabilities only. It never connects a wallet or executes a trade.</p>
        </div>
        <ol className="landing-steps">
          <li><span>01</span><div><Eye size={18} aria-hidden="true" /><strong>Find a market</strong><p>Search HIP-4 outcomes or scan the biggest recent movers.</p></div></li>
          <li><span>02</span><div><BellRing size={18} aria-hidden="true" /><strong>Set your crossing</strong><p>Choose YES or NO, above or below, and your exact threshold.</p></div></li>
          <li><span>03</span><div><Send size={18} aria-hidden="true" /><strong>Get one alert</strong><p>Receive the crossing on Telegram, then re-arm only if you want to.</p></div></li>
        </ol>
      </section>
    </main>
  );
}
