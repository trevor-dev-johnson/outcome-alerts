"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MoversRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
