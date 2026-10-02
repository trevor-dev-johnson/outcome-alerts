import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { PublicNav } from "@/components/public-nav";
import { aboutJsonLd, SITE_NAME, SITE_URL } from "@/lib/site";
import styles from "./about.module.css";

const title = "About oddsUp | Hyperliquid HIP-4 Market Alerts";
const description =
  "Learn how oddsUp monitors Hyperliquid HIP-4 outcome markets and sends Telegram alerts when market probabilities cross the thresholds you set.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/about`,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd).replace(/</g, "\\u003c") }}
      />

      <PublicNav current="about" />

      <main className={styles.main}>
        <article>
          <header className={styles.hero}>
            <p className="eyebrow">Hyperliquid HIP-4 · Probability monitoring</p>
            <h1>About oddsUp</h1>
            <p className={styles.lede}>
              oddsUp monitors Hyperliquid HIP-4 outcome markets and alerts you when the probabilities you care about move.
            </p>
            <div className={styles.intro}>
              <p>Instead of repeatedly checking markets yourself, choose a market, set a probability threshold, and let oddsUp watch it for you.</p>
              <p>When that threshold is crossed, oddsUp sends you a Telegram notification.</p>
            </div>
            <div className={styles.actions}>
              <Link href="/markets" className="btn btn-primary">Browse live markets <ArrowUpRight size={15} /></Link>
              <Link href="/markets" className="btn btn-quiet">Create an alert</Link>
            </div>
          </header>

          <section className={styles.section} aria-labelledby="what-is-oddsup">
            <h2 id="what-is-oddsup">What is oddsUp?</h2>
            <div className={styles.copy}>
              <p>oddsUp is a real-time monitoring and alerting tool built specifically for active Hyperliquid HIP-4 outcome markets.</p>
              <p>It lets you follow either the YES or NO side of a market and create a one-shot alert for when its probability crosses above or below the percentage you choose.</p>
              <ul className={styles.examples}>
                <li><span>YES</span> moves above 80%</li>
                <li><span>NO</span> falls below 30%</li>
                <li><span>YES</span> falls below 50%</li>
              </ul>
              <p>oddsUp handles the continuous monitoring, so you do not have to keep refreshing market pages to see whether a crossing happened.</p>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="what-are-hip4-markets">
            <h2 id="what-are-hip4-markets">What are Hyperliquid HIP-4 markets?</h2>
            <div className={styles.copy}>
              <p>HIP-4 is Hyperliquid&apos;s outcome-market system. These markets represent defined outcomes rather than normal spot assets or perpetual futures.</p>
              <p>In a binary outcome market, the two sides can be expressed as YES and NO. A YES price around 0.70 can be read as the market pricing that outcome at roughly a 70% implied probability. That is a market signal—not objective truth and not an oddsUp prediction.</p>
              <p>oddsUp does not create or resolve HIP-4 markets. It reads market information from Hyperliquid and makes changes easier to monitor. Hyperliquid&apos;s <a href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids#outcomes">official documentation</a> is the authoritative source for HIP-4 itself.</p>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="how-alerts-work">
            <h2 id="how-alerts-work">How oddsUp alerts work</h2>
            <div className={styles.copy}>
              <ol className={styles.steps}>
                <li><span className="eyebrow">01 · Choose a market</span><h3>Follow an outcome</h3><p>Browse supported active HIP-4 markets and select one to follow.</p></li>
                <li><span className="eyebrow">02 · Set your alert</span><h3>Define the crossing</h3><p>Choose YES or NO, above or below, and a probability threshold.</p></li>
                <li><span className="eyebrow">03 · Get notified</span><h3>Connect Telegram</h3><p>oddsUp monitors the market and sends a Telegram message when the configured crossing occurs.</p></li>
              </ol>
              <p className={styles.caution}><strong>oddsUp is a monitoring tool. It does not make trading decisions for you.</strong> A notification tells you that your configured condition happened; it does not tell you whether you should trade.</p>
              <Link href="/markets" className={styles.textLink}>Browse supported markets <ArrowUpRight size={14} /></Link>
            </div>
          </section>

          <section className={`${styles.section} ${styles.reason}`} aria-labelledby="why-oddsup-exists">
            <h2 id="why-oddsup-exists">Why oddsUp exists</h2>
            <div className={styles.copy}>
              <p>Prediction markets can move quickly. Monitoring several markets manually means repeatedly checking prices just to learn whether something important changed.</p>
              <p className={styles.statement}>Pick the market. Set the condition. <span>Get notified when it happens.</span></p>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="official-source">
            <h2 id="official-source">The official source for oddsUp</h2>
            <div className={styles.copy}>
              <p className={styles.official}><strong>oddsup.xyz is the official website for oddsUp.</strong></p>
              <p>Information published here is the primary source for oddsUp features, supported alert types, supported markets, product behavior, documentation, and product updates.</p>
              <p>Third-party posts, social media posts, search results, and AI-generated summaries can become outdated. For current product information, refer to oddsup.xyz.</p>
              <p><strong>oddsUp is an independent product and is not Hyperliquid.</strong> No partnership, endorsement, or official relationship is implied.</p>
              <div className={styles.actions}>
                <Link href="/markets" className="btn btn-primary">Browse markets <ArrowUpRight size={15} /></Link>
                <Link href="/alerts" className="btn btn-quiet">View your alerts</Link>
              </div>
            </div>
          </section>
        </article>
      </main>

      <footer className={styles.footer}>
        <div className="shell">
          <Brand />
          <nav aria-label="Footer navigation">
            <Link href="/">Home</Link>
            <Link href="/movers">Movers</Link>
            <Link href="/markets">Markets</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
