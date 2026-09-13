import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

export default function Home() {
  return (
    <main className="landing">
      <header><div className="shell topbar-inner"><Brand /><Link href="/login" className="btn btn-quiet">Sign in</Link></div></header>
      <div className="landing-main shell">
        <div className="landing-copy">
          <p className="eyebrow">Hyperliquid HIP-4 · Probability monitoring</p>
          <h1>odds<span>up.</span></h1>
          <div className="landing-bottom">
            <Link href="/login" className="btn btn-primary">Get started <ArrowUpRight size={16} /></Link>
            <p>Get notified on Telegram the moment a prediction market crosses your threshold.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
