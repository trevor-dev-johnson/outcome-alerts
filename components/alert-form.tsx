"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BellRing, Send, X } from "lucide-react";
import { createAlert, type AlertFormState } from "@/app/(app)/markets/actions";
import type { Market } from "@/lib/types";

export function AlertForm({ market, telegramConnected }: { market: Market; telegramConnected: boolean }) {
  const [outcome, setOutcome] = useState<"YES"|"NO">("YES");
  const [dismissedAlertId, setDismissedAlertId] = useState<string | null>(null);
  const [state, action, pending] = useActionState<AlertFormState, FormData>(createAlert, {});
  const current = outcome === "YES" ? market.yesPrice : market.noPrice;
  const showTelegramPrompt = Boolean(
    state.needsTelegram && state.alertId && dismissedAlertId !== state.alertId,
  );
  return <aside className="form-panel">
    <p className="eyebrow">New probability alert</p><h2>Choose a crossing</h2>
    <form action={action}>
      <input type="hidden" name="marketId" value={market.id} /><input type="hidden" name="marketName" value={market.name} />
      <input type="hidden" name="currentPrice" value={current ?? ""} />
      <div className="field"><span className="field-label">Outcome</span><div className="segmented">
        {(["YES","NO"] as const).map((value) => <label key={value}><input type="radio" name="outcome" value={value} checked={outcome===value} onChange={() => setOutcome(value)} /><span>{value}</span></label>)}
      </div></div>
      <div className="field"><span className="field-label">Condition</span><div className="segmented">
        <label><input type="radio" name="operator" value="above" defaultChecked /><span>Above</span></label><label><input type="radio" name="operator" value="below" /><span>Below</span></label>
      </div></div>
      <div className="field"><label htmlFor="threshold">Threshold</label><div className="threshold-wrap"><input id="threshold" name="threshold" type="number" min="0.1" max="99.9" step="0.1" defaultValue="70" required /><span>%</span></div></div>
      {!telegramConnected && <div className="notice">Telegram isn’t connected. You can create the alert now, but connect Telegram in Settings to receive it.</div>}
      {state.error && <p className="message danger">{state.error}</p>}{state.success && <p className="message">{state.success}</p>}
      <button className="btn btn-primary" disabled={pending}><BellRing size={15} />{pending ? "Arming…" : "Create alert"}</button>
    </form>
    {showTelegramPrompt && <div className="modal-backdrop" role="presentation">
      <section className="telegram-prompt" role="dialog" aria-modal="true" aria-labelledby="telegram-prompt-title" aria-describedby="telegram-prompt-description">
        <button className="modal-close" type="button" aria-label="Close" onClick={() => setDismissedAlertId(state.alertId ?? null)}><X size={17}/></button>
        <span className="telegram-icon"><Send size={19}/></span>
        <p className="eyebrow">One step left</p>
        <h2 id="telegram-prompt-title">Where should we send it?</h2>
        <p id="telegram-prompt-description">Your alert is saved. Connect Telegram now so oddsup can notify you when this probability crosses your threshold.</p>
        <div className="modal-actions">
          <Link href="/settings?connect=telegram" className="btn btn-primary"><Send size={14}/> Connect Telegram</Link>
          <button className="btn btn-quiet" type="button" onClick={() => setDismissedAlertId(state.alertId ?? null)}>Not now</button>
        </div>
      </section>
    </div>}
  </aside>;
}
