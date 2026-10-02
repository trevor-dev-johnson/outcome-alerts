import Link from "next/link";
import { Brand } from "./brand";

export function PublicNav({
  authenticated = false,
  current,
}: {
  authenticated?: boolean;
  current?: "movers" | "about";
}) {
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Brand />
        <nav className="nav" aria-label="Public navigation">
          <Link href="/movers" aria-current={current === "movers" ? "page" : undefined}>Movers</Link>
          <Link href="/about" aria-current={current === "about" ? "page" : undefined}>About</Link>
          <Link href={authenticated ? "/markets" : "/login"}>{authenticated ? "Markets" : "Sign in"}</Link>
        </nav>
      </div>
    </header>
  );
}
