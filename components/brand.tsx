import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="oddsup home">
      <span className="brand-mark" aria-hidden="true" />
      {!compact && <span className="brand-text">oddsup</span>}
    </Link>
  );
}
