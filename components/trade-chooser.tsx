"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { formatProbability } from "@/lib/format";

type TradeChooserProps = {
  yesUrl: string | null;
  noUrl: string | null;
  yesProbability: number | null;
  noProbability: number | null;
};

export function TradeChooser({
  yesUrl,
  noUrl,
  yesProbability,
  noProbability,
}: TradeChooserProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeChooser() {
      detailsRef.current?.removeAttribute("open");
    }

    function handlePointerDown(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) closeChooser();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !detailsRef.current?.open) return;
      closeChooser();
      detailsRef.current?.querySelector<HTMLElement>("summary")?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!yesUrl && !noUrl) return null;

  return <details className="market-trade-chooser" ref={detailsRef}>
    <summary className="btn market-trade-trigger">
      <span>Trade on Hyperliquid</span>
      <ExternalLink size={15} aria-hidden />
    </summary>
    <div className="market-trade-popover" role="group" aria-label="Choose an outcome to trade">
      {yesUrl ? <a
        className="market-trade-option"
        data-trade-outcome="YES"
        href={yesUrl}
        aria-label={`Trade YES on Hyperliquid at ${formatProbability(yesProbability)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>YES <span aria-hidden>·</span> {formatProbability(yesProbability)}</span>
        <ExternalLink size={14} aria-hidden />
      </a> : null}
      {noUrl ? <a
        className="market-trade-option"
        data-trade-outcome="NO"
        href={noUrl}
        aria-label={`Trade NO on Hyperliquid at ${formatProbability(noProbability)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>NO <span aria-hidden>·</span> {formatProbability(noProbability)}</span>
        <ExternalLink size={14} aria-hidden />
      </a> : null}
    </div>
  </details>;
}
