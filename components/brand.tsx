import Link from "next/link";
import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="oddsup home">
      <Image className="brand-mark" src="/oddsup-mark.png" alt="" width={28} height={28} />
      {!compact && <span className="brand-text">oddsup</span>}
    </Link>
  );
}
