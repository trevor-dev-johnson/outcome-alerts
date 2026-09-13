import { AppNav } from "@/components/app-nav";

export default function ApplicationLayout({ children }: { children: React.ReactNode }) {
  return <><AppNav />{children}</>;
}
