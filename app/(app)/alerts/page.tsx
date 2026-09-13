import Link from "next/link";
import { Plus } from "lucide-react";
import { AlertList } from "@/components/alert-list";
import { getAlerts } from "@/lib/auth";

export const dynamic = "force-dynamic"; export const metadata = { title:"Alerts" };
export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status }, alerts] = await Promise.all([searchParams, getAlerts()]);
  const selected = ["active","triggered","disabled"].includes(status ?? "") ? status! : "active";
  const visible = alerts.filter((a) => a.status === selected);
  return <main className="app-main"><div className="shell"><header className="page-head"><div><span className="eyebrow">One-shot crossings</span><h1>Alerts</h1></div><p className="muted">Each alert fires once at the crossing, then waits for you to re-arm it.</p><Link href="/markets" className="btn btn-primary"><Plus size={15}/> New alert</Link></header>
    <nav className="tabs" aria-label="Alert status">{["active","triggered","disabled"].map((item) => <Link key={item} href={`/alerts?status=${item}`} className={`tab ${selected===item?"active":""}`}>{item[0].toUpperCase()+item.slice(1)} <span className="mono">{alerts.filter(a=>a.status===item).length}</span></Link>)}</nav>
    <AlertList alerts={visible}/></div></main>;
}
