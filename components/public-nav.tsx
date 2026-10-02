import Link from "next/link";
import { Brand } from "./brand";

export function PublicNav({
  authenticated = false,
  current,
}: {
  authenticated?: boolean;
  current?: "movers" | "about" | "markets";
}) {
  const links = authenticated
    ? [
        ["/movers", "Movers"],
        ["/markets", "Markets"],
        ["/alerts", "Alerts"],
        ["/settings", "Settings"],
      ] as const
    : [
        ["/movers", "Movers"],
        ["/about", "About"],
        ["/login", "Sign in"],
      ] as const;

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Brand />
        <nav className="nav" aria-label="Public navigation">
          {links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={current && href === `/${current}` ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
