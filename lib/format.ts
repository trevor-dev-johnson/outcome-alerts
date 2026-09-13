export function formatProbability(value: number | null | undefined, compact = false) {
  if (value == null || !Number.isFinite(value)) return "—";
  const percent = value * 100;
  return `${percent.toFixed(compact && Number.isInteger(percent) ? 0 : 1)}%`;
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
