import { RotateCcw, Trash2 } from "lucide-react";
import { formatProbability, formatRelativeTime } from "@/lib/format";
import type { Alert } from "@/lib/types";
import { deleteAlert, disableAlert, enableAlert, rearmAlert } from "@/app/(app)/alerts/actions";

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <div className="empty">No alerts yet. Choose a market to arm your first crossing.</div>;
  return <div>{alerts.map((alert) => <article className="alert-row" key={alert.id}>
    <div><div className="market-meta"><span>#{alert.market_id}</span><span>{formatRelativeTime(alert.created_at)}</span></div><div className="market-title">{alert.market_name}</div></div>
    <div className="alert-rule"><span className={alert.outcome === "YES" ? "signal" : ""}>{alert.outcome}</span> {alert.operator === "above" ? ">" : "<"} {formatProbability(alert.threshold)}</div>
    <div><span className={`status status-${alert.status}`}>{alert.status}</span>{alert.last_observed_price != null && <div className="eyebrow" style={{ marginTop:8 }}>Last {formatProbability(alert.last_observed_price)}</div>}</div>
    <div className="row-actions">
      {alert.status === "active" && <form action={disableAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet">Disable</button></form>}
      {alert.status === "disabled" && <form action={enableAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet">Enable</button></form>}
      {alert.status === "triggered" && <form action={rearmAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet"><RotateCcw size={13}/> Re-arm</button></form>}
      <form action={deleteAlert}><input type="hidden" name="id" value={alert.id}/><button className="btn btn-quiet btn-danger" aria-label="Delete alert"><Trash2 size={14}/></button></form>
    </div>
  </article>)}</div>;
}
