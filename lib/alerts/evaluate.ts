import type { Operator } from "@/lib/types";

export interface CrossingInput {
  operator: Operator;
  previousPrice: number | null;
  currentPrice: number;
  threshold: number;
}

export function didCrossThreshold({
  operator,
  previousPrice,
  currentPrice,
  threshold,
}: CrossingInput): boolean {
  if (previousPrice == null) return false;
  if (![previousPrice, currentPrice, threshold].every(Number.isFinite)) return false;
  return operator === "above"
    ? previousPrice < threshold && currentPrice >= threshold
    : previousPrice > threshold && currentPrice <= threshold;
}
