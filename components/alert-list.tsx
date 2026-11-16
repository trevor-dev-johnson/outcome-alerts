import Link from "next/link";
import { ArrowUpRight, RotateCcw, Trash2 } from "lucide-react";
import { formatProbability, formatRelativeTime } from "@/lib/format";
import type { Alert } from "@/lib/types";
import { deleteAlert, disableAlert, enableAlert, rearmAlert } from "@/app/(app)/alerts/actions";

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <div className="empty"><p>No alerts in this view.</p><Link href="/markets" className="btn btn-quiet">Browse markets <ArrowUpRight size={14} aria-hidden="true" /></Link></div>;
  return <div className="alert-list">{alerts.map((alert) => <article className="alert-card" key={alert.id}>
    <header className="alert-card-head">
      <div><div className="market-meta"><span>Market #{alert.market_id}</span><span>Created {formatRelativeTime(alert.created_at)}</span></div><div className="market-title">{alert.market_name}</div></div>
      <span className={`status status-${alert.status}`}>{alert.status}</span>
    </header>
    <div className="alert-card-details">
      <div><span className="eyebrow">Crossing</span><strong className="alert-rule"><span className={alert.outcome === "YES" ? "signal" : ""}>{alert.outcome}</span> {alert.operator} {formatProbability(alert.threshold)}</strong></div>
      <div><span className="eyebrow">Last observed</span><strong className="alert-observed">{alert.last_observed_price != null ? formatProbability(alert.last_observed_price) : "Not observed yet"}</strong></div>
    </div>
    <footer className="row-actions" aria-label={`Manage alert for ${alert.market_name}`}>
      {alert.status === "active" && <form action={disableAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet">Disable</button></form>}
      {alert.status === "disabled" && <form action={enableAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet">Enable</button></form>}
      {alert.status === "triggered" && <form action={rearmAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet"><RotateCcw size={13} aria-hidden="true"/> Re-arm</button></form>}
      <form action={deleteAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet btn-danger"><Trash2 size={14} aria-hidden="true"/> Delete</button></form>
    </footer>
  </article>)}</div>;
}
