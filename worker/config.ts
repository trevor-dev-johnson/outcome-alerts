export const DEFAULT_ALERT_SYNC_INTERVAL_MS = 30_000;
export const DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS = 20_000;
export const MAX_WORKER_SHUTDOWN_TIMEOUT_MS = 120_000;

export type RadarDeliveryConfig =
  | { enabled: false; mode: "disabled" }
  | { enabled: true; mode: "global" }
  | { enabled: true; mode: "canary"; userIds: ReadonlySet<string> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function getRadarDeliveryConfig(
  notifications = process.env.RADAR_NOTIFICATIONS_ENABLED,
  canaryMode = process.env.RADAR_CANARY_MODE,
  canaryUserIds = process.env.RADAR_CANARY_USER_IDS,
): RadarDeliveryConfig {
  if (notifications !== "true") return { enabled: false, mode: "disabled" };

  const mode = canaryMode?.trim();
  const rawUserIds = canaryUserIds?.trim();
  if (mode === "true") {
    const values = rawUserIds?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    if (values.length === 0 || values.some((value) => !UUID_PATTERN.test(value))) {
      return { enabled: false, mode: "disabled" };
    }
    return { enabled: true, mode: "canary", userIds: new Set(values.map((value) => value.toLowerCase())) };
  }

  // A malformed mode or orphaned allowlist must never fall through to global delivery.
  if ((mode != null && mode !== "" && mode !== "false") || rawUserIds) {
    return { enabled: false, mode: "disabled" };
  }
  return { enabled: true, mode: "global" };
}
