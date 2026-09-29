import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-box">
        <Brand />
        <p className="eyebrow" style={{ marginTop: 42 }}>404 · Signal not found</p>
        <h1>Nothing here.</h1>
        <p>The page you requested does not exist or has moved.</p>
        <Link href="/" className="btn btn-primary">
          <ArrowLeft size={15} /> Back to oddsUp
        </Link>
      </section>
    </main>
  );
}
