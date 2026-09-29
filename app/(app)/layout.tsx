import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ApplicationLayout({ children }: { children: React.ReactNode }) {
  return <><AppNav />{children}</>;
}
