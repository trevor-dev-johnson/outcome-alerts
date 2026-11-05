import Link from "next/link";
import { Brand } from "./brand";

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="shell site-footer-inner">
      <Brand />
      <nav aria-label="Footer navigation">
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </div>
  </footer>;
}
