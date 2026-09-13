"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";

const links = [
  ["/markets", "Markets"], ["/alerts", "Alerts"], ["/settings", "Settings"],
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Brand />
        <nav className="nav" aria-label="Primary navigation">
          {links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
