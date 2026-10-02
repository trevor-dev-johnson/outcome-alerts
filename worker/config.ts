export const DEFAULT_ALERT_SYNC_INTERVAL_MS = 30_000;

export function getAlertSyncInterval(value = process.env.ALERT_SYNC_INTERVAL_MS) {
  return Number(value ?? DEFAULT_ALERT_SYNC_INTERVAL_MS);
}
