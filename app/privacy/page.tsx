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
        <p className={styles.updated}>Draft reviewed against application behavior · November 5, 2026</p>
        <p className={styles.review}><strong>Owner review required before publication:</strong> add a monitored privacy contact and confirm how long Vercel, Railway, Supabase, Telegram, and the configured email provider retain their own operational logs.</p>
      </header>

      <section className={styles.section}><h2>Information oddsUp handles</h2><div className={styles.copy}>
        <ul>
          <li><strong>Account and session data.</strong> Your email address is used by Supabase Auth for passwordless sign-in. Essential Supabase session and PKCE cookies keep the sign-in flow secure and the browser signed in.</li>
          <li><strong>Alerts.</strong> oddsUp stores the market, outcome, crossing direction, threshold, status, observation baseline, and timestamps needed to evaluate and manage your alerts.</li>
          <li><strong>Telegram connection data.</strong> If you connect Telegram, oddsUp stores the Telegram user ID, chat ID, username when supplied by Telegram, and connection time. Connection links use a hashed, single-use token that expires after ten minutes.</li>
          <li><strong>Radar data.</strong> The database can store Radar follows and delivery events. Radar configuration is currently marked Coming Soon and public Radar mutations are disabled.</li>
          <li><strong>Market data.</strong> Public HIP-4 metadata, prices, and sampled probability history come from Hyperliquid. This market history is not linked to a user account.</li>
          <li><strong>Operational data.</strong> Hosting and worker logs can contain request metadata, timestamps, errors, and limited identifiers needed to diagnose connection or delivery failures.</li>
        </ul>
      </div></section>

      <section className={styles.section}><h2>How it is used</h2><div className={styles.copy}>
        <p>oddsUp processes this information to authenticate users, display saved alerts, evaluate probability crossings, connect or disconnect Telegram, deliver requested notifications, prevent duplicate delivery, enforce rate limits, and investigate service failures.</p>
        <p>The repository contains no advertising SDK, cross-site tracking pixel, or product-analytics SDK. Infrastructure providers may still process ordinary request and security logs under their own terms.</p>
      </div></section>

      <section className={styles.section}><h2>Service providers</h2><div className={styles.copy}>
        <ul>
          <li><strong>Supabase</strong> provides authentication and the production database.</li>
          <li><strong>Vercel</strong> hosts the web application.</li>
          <li><strong>Railway</strong> runs the background market-monitoring worker.</li>
          <li><strong>Telegram</strong> receives the chat identifier and alert message needed to deliver notifications you request.</li>
          <li><strong>Hyperliquid</strong> supplies public market information. oddsUp does not send Hyperliquid your oddsUp account profile to read that public data.</li>
        </ul>
        <p>Passwordless email is sent through Supabase Auth and its configured email-delivery provider. The provider name is an operator configuration fact that must be confirmed before publication.</p>
      </div></section>

      <section className={styles.section}><h2>Retention and control</h2><div className={styles.copy}>
        <p>Account, profile, alert, and subscription records remain until they are removed or the associated authentication account is deleted. You can delete individual alerts. Disconnecting Telegram clears the Telegram identity fields from your profile.</p>
        <p>Telegram connection tokens stop working after ten minutes, although the current repository does not define an automatic cleanup schedule for expired token rows. Public market-probability samples are configured for roughly 48 hours of retention. When Radar delivery is enabled, its delivery events are configured for a 30-day cleanup window.</p>
        <p>There is currently no in-product account-deletion button. Deleting a Supabase Auth account is designed to cascade to its user-owned profile, alerts, delivery claims, and Radar records, but it requires operator action.</p>
      </div></section>

      <section className={styles.section}><h2>Your choices and contact</h2><div className={styles.copy}>
        <p>You may delete alerts from the Alerts page, disconnect Telegram from Settings, and sign out to clear the local OddsUp session. Account-access or deletion requests need a monitored operator contact.</p>
        <p><strong>Contact pending owner confirmation:</strong> a working privacy email address or support route must be added here before this policy is deployed.</p>
      </div></section>

      <section className={styles.section}><h2>Security and changes</h2><div className={styles.copy}>
        <p>oddsUp uses authenticated sessions, row-level database policies, and caller-scoped operations to limit access to user-owned records. No online service can promise absolute security or uninterrupted availability.</p>
        <p>This page should be updated when the data handled by oddsUp, its providers, or its retention practices materially change.</p>
      </div></section>
    </main>
  </div>;
}
