"use client";

import { useActionState, useState } from "react";
import { createRadarSubscription, manageRadarSubscription } from "./actions";
import type { RadarSubscription } from "@/lib/radar";
import styles from "./radar.module.css";

export function RadarCreateForm({ markets, categories, disabled }: {
  markets: { id: string; name: string }[]; categories: string[]; disabled: boolean;
}) {
  const [state, action, pending] = useActionState(createRadarSubscription, {});
  const [kind, setKind] = useState("market");
  return <form action={action} className={styles.form}>
    <h2>Follow a market or league</h2>
    <label>Follow type<select name="targetKind" value={kind} onChange={(e) => setKind(e.target.value)}>
      <option value="market">Specific market</option><option value="category">Verified league</option>
    </select></label>
    <label>{kind === "market" ? "Market" : "League"}<select name="target" required key={kind}>
      <option value="">Choose…</option>
      {kind === "market" ? markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)
        : categories.map((c) => <option key={c}>{c}</option>)}
    </select></label>
    <div className={styles.fields}>
      <label>Movement (percentage points)<input name="threshold" type="number" min="1" max="100" step="0.1" defaultValue="5" required /></label>
      <label>Comparison window<select name="window" defaultValue="1h"><option value="5m">5 minutes</option><option value="1h">1 hour</option><option value="24h">24 hours</option></select></label>
    </div>
    <p className="muted">Notify on a YES-probability move in either direction. A move from 40% to 45% is 5 percentage points. Observations are sampled every five minutes; missing or stale samples produce no signal.</p>
    <label className={styles.consent}><input type="checkbox" name="consent" value="yes" required /> I opt in to Radar movement notifications through my connected Telegram account.</label>
    <button className="btn btn-primary" disabled={disabled || pending}>Save follow</button>
    <p role="status">{state.error ?? state.success}</p>
  </form>;
}

export function RadarManageForm({ subscription }: { subscription: RadarSubscription }) {
  const [state, action, pending] = useActionState(manageRadarSubscription, {});
  return <form action={action} className={styles.controls}>
    <input type="hidden" name="id" value={subscription.id} />
    <button className="btn btn-quiet" name="operation" value={subscription.paused ? "resume" : "pause"} disabled={pending}>{subscription.paused ? "Resume" : "Pause"}</button>
    <button className="btn btn-quiet" name="operation" value="remove" disabled={pending}>Remove</button>
    <span role="status">{state.error ?? state.success}</span>
  </form>;
}
