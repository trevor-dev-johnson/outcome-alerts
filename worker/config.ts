export const DEFAULT_ALERT_SYNC_INTERVAL_MS = 30_000;
export const DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS = 20_000;
export const MAX_WORKER_SHUTDOWN_TIMEOUT_MS = 120_000;

export function getAlertSyncInterval(value = process.env.ALERT_SYNC_INTERVAL_MS) {
  return Number(value ?? DEFAULT_ALERT_SYNC_INTERVAL_MS);
}

export function getWorkerShutdownTimeout(value = process.env.WORKER_SHUTDOWN_TIMEOUT_MS) {
  if (value == null || value.trim() === "") return DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > MAX_WORKER_SHUTDOWN_TIMEOUT_MS) {
    return DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS;
  }
  return parsed;
}
