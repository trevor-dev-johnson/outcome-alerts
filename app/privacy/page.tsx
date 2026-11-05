import type { Metadata } from "next";
import { PublicNav } from "@/components/public-nav";
import { SITE_URL } from "@/lib/site";
import styles from "../legal.module.css";

const title = "Privacy Policy | oddsUp";
const description = "How oddsUp processes account, alert, Telegram, market, and operational data.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return <div className={styles.page}>
    <PublicNav />
    <main className={styles.main}>
      <header className={styles.header}>
        <p className="eyebrow">Privacy</p>
        <h1>Privacy, in plain language.</h1>
        <p className={styles.lede}>oddsUp uses the information needed to sign you in, save your monitoring choices, connect Telegram, and deliver alerts. It does not include advertising or behavioral-analytics code.</p>
        <p className={styles.updated}>Effective November 5, 2026</p>
      </header>

      <section className={styles.section}><h2>Information oddsUp handles</h2><div className={styles.copy}>
        <ul>
          <li><strong>Account and session data.</strong> Your email address is used by Supabase Auth for passwordless sign-in. Essential Supabase session and PKCE cookies keep the sign-in flow secure and the browser signed in.</li>
          <li><strong>Alerts.</strong> oddsUp stores the market, outcome, crossing direction, threshold, status, observation baseline, and timestamps needed to evaluate and manage your alerts.</li>
          <li><strong>Telegram connection data.</strong> If you connect Telegram, oddsUp stores the Telegram user ID, chat ID, username when supplied by Telegram, and connection time. Connection links use a hashed, single-use token that expires after ten minutes.</li>
          <li><strong>Radar data.</strong> The database can store Radar follows and delivery events. Radar is currently marked Coming Soon and public Radar configuration is disabled.</li>
          <li><strong>Market data.</strong> Public HIP-4 metadata, prices, and sampled probability history come from Hyperliquid. This market history is not linked to a user account.</li>
          <li><strong>Operational data.</strong> Hosting and worker logs may contain request metadata, timestamps, and errors needed to operate and troubleshoot the service.</li>
        </ul>
      </div></section>

      <section className={styles.section}><h2>How it is used</h2><div className={styles.copy}>
        <p>oddsUp processes this information to authenticate users, display saved alerts, evaluate probability crossings, connect or disconnect Telegram, deliver requested notifications, prevent duplicate delivery, enforce rate limits, and investigate service failures.</p>
        <p>oddsUp does not use advertising SDKs, cross-site tracking pixels, or product-analytics SDKs. Infrastructure providers may still process ordinary request and security logs under their own terms.</p>
      </div></section>

      <section className={styles.section}><h2>Service providers</h2><div className={styles.copy}>
        <ul>
          <li><strong>Supabase</strong> provides authentication and the database.</li>
          <li><strong>Resend</strong> delivers passwordless sign-in email configured through Supabase Auth.</li>
          <li><strong>Vercel</strong> hosts the web application.</li>
          <li><strong>Railway</strong> runs the market-monitoring worker.</li>
          <li><strong>Telegram</strong> processes the chat identifier and alert message needed to deliver notifications you request.</li>
          <li><strong>Hyperliquid</strong> supplies public market information. oddsUp does not send it your oddsUp account profile to read that data.</li>
        </ul>
      </div></section>

      <section className={styles.section}><h2>Retention and control</h2><div className={styles.copy}>
        <p>Account, profile, alert, and subscription records remain until they are removed or the associated account is deleted. You can delete individual alerts, and disconnecting Telegram clears its identity fields from your profile.</p>
        <p>Telegram connection links expire after ten minutes. Public market-probability samples are configured for roughly 48 hours. If Radar delivery launches, its delivery events are configured for a 30-day cleanup window. Infrastructure providers may retain operational logs under their own policies and settings.</p>
        <p>There is no in-product account-deletion button. Account or data deletion requires an operator request; deleting the authentication account is designed to remove its related profile, alerts, delivery claims, and Radar records.</p>
      </div></section>

      <section className={styles.section}><h2>Your choices and contact</h2><div className={styles.copy}>
        <p>You may delete alerts from Alerts, disconnect Telegram from Settings, and sign out to clear the local oddsUp session.</p>
        <p>For privacy questions or an account/data deletion request, contact <a href="https://x.com/whizzkee" target="_blank" rel="noopener noreferrer">@whizzkee on X</a>. Do not include passwords, magic links, or other credentials in your message.</p>
      </div></section>

      <section className={styles.section}><h2>Security and changes</h2><div className={styles.copy}>
        <p>oddsUp uses authenticated sessions, row-level database policies, and caller-scoped operations to limit access to user-owned records. No online service can promise absolute security or uninterrupted availability.</p>
        <p>This page should be updated when the data handled by oddsUp, its providers, or its retention practices materially change.</p>
      </div></section>
    </main>
  </div>;
}
