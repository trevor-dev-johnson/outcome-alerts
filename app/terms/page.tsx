import type { Metadata } from "next";
import { PublicNav } from "@/components/public-nav";
import { SITE_URL } from "@/lib/site";
import styles from "../legal.module.css";

const title = "Terms of Use | oddsUp";
const description = "Terms for using oddsUp's watch-only Hyperliquid HIP-4 monitoring and alert service.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return <div className={styles.page}>
    <PublicNav />
    <main className={styles.main}>
      <header className={styles.header}>
        <p className="eyebrow">Terms of use</p>
        <h1>Watch markets. Make your own decisions.</h1>
        <p className={styles.lede}>oddsUp is a free, watch-only monitoring tool. It shows public HIP-4 market information and sends alerts you configure; it does not execute trades or control funds.</p>
        <p className={styles.updated}>Draft for owner review · November 5, 2026</p>
        <p className={styles.review}><strong>Owner or legal review required before publication:</strong> confirm the legal operator name and contact, minimum user age, governing law, dispute process, warranty language, and any liability cap.</p>
      </header>

      <section className={styles.section}><h2>What oddsUp provides</h2><div className={styles.copy}>
        <p>oddsUp provides informational access to public Hyperliquid HIP-4 market data, sampled movement views, and user-configured probability alerts. The service is currently offered without charge. Future pricing, if any, would require clear notice.</p>
        <p>Radar is marked Coming Soon. Radar configuration and notification delivery should not be treated as available until oddsUp explicitly launches that feature.</p>
      </div></section>

      <section className={styles.section}><h2>Watch-only, not execution</h2><div className={styles.copy}>
        <p>oddsUp does not connect a wallet, hold balances, submit orders, sign transactions, execute trades, resolve outcome markets, or take custody of funds. Market information and alerts are monitoring tools only.</p>
      </div></section>

      <section className={styles.section}><h2>No investment advice</h2><div className={styles.copy}>
        <p>Nothing on oddsUp is financial, investment, legal, tax, or trading advice. A displayed probability is a market-derived signal, not a prediction or statement of fact. An alert means only that the condition you configured was observed.</p>
        <p>You are responsible for checking the underlying market, its rules, current data, and any decision you make. Do not rely on oddsUp as your only source of information.</p>
      </div></section>

      <section className={styles.section}><h2>Independent service</h2><div className={styles.copy}>
        <p>oddsUp is independent from Hyperliquid. It is not sponsored, endorsed, operated by, or partnered with Hyperliquid. Hyperliquid, Telegram, and other third-party services have their own terms, availability, and privacy practices.</p>
        <p>Third-party names and market information are used only to identify the services and public markets being monitored.</p>
      </div></section>

      <section className={styles.section}><h2>Availability and data limits</h2><div className={styles.copy}>
        <p>Market data can be delayed, unavailable, incomplete, stale, or corrected upstream. Network outages, provider failures, maintenance, and software errors can delay or prevent an alert. Notification delivery is not guaranteed; an alert may be delayed or not delivered.</p>
        <p>oddsUp may change, pause, or discontinue parts of the service when reasonably necessary for reliability, security, legal compliance, or product development.</p>
      </div></section>

      <section className={styles.section}><h2>Acceptable use</h2><div className={styles.copy}>
        <p>Use oddsUp lawfully and do not attempt to disrupt the service, bypass access controls, probe other users&apos; data, automate abusive request volumes, or misuse Telegram delivery. Keep access to your email and Telegram accounts secure.</p>
      </div></section>

      <section className={styles.section}><h2>Risk and review</h2><div className={styles.copy}>
        <p>You use oddsUp and act on market information at your own risk. The product should not be represented as guaranteeing market accuracy, notification delivery, uptime, or a particular financial result.</p>
        <p><strong>Legal terms still requiring owner review:</strong> the final operator identity, contact channel, eligibility rules, governing law, dispute procedure, warranty disclaimer, limitation of liability, and account-suspension process are intentionally not invented in this draft.</p>
      </div></section>
    </main>
  </div>;
}
