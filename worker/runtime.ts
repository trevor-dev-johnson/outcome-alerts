import type { AlertEvaluator } from "./alerts";
import type { HyperliquidStream } from "./hyperliquid";
import type { MarketHistoryRecorder } from "./history";

type RuntimeBot = {
  start(options: { onStart: (botInfo: { username: string }) => void }): Promise<void>;
  stop(): Promise<void>;
};

type RuntimeEvaluator = Pick<AlertEvaluator, "refresh" | "beginShutdown" | "drain">;

type RuntimeOptions = {
  alertSyncIntervalMs: number;
  historyIntervalMs: number;
  shutdownTimeoutMs: number;
  exit?: (code: number) => void;
  radar?: { run: () => Promise<void>; stop: () => void };
};

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    try { return JSON.stringify(error); }
    catch { return "Unknown object error"; }
  }
  return String(error);
}

export class WorkerRuntime {
  private acceptingWork = true;
  private alertTimer: ReturnType<typeof setInterval> | null = null;
  private historyTimer: ReturnType<typeof setInterval> | null = null;
  private activeOperations = new Set<Promise<void>>();
  private botPolling: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private readonly exit: (code: number) => void;

  constructor(
    private readonly evaluator: RuntimeEvaluator,
    private readonly stream: Pick<HyperliquidStream, "setCoins" | "start" | "stop">,
    private readonly history: Pick<MarketHistoryRecorder, "record">,
    private readonly bot: RuntimeBot,
    private readonly options: RuntimeOptions,
  ) {
    this.exit = options.exit ?? process.exit;
  }

  async start() {
    await Promise.all([this.syncAlerts(), this.syncMarketHistory()]);
    if (!this.acceptingWork) return;

    this.stream.start();
    this.alertTimer = setInterval(() => { void this.syncAlerts(); }, this.options.alertSyncIntervalMs);
    this.historyTimer = setInterval(() => { void this.syncMarketHistory(); }, this.options.historyIntervalMs);
    this.botPolling = this.bot.start({
      onStart: ({ username }) => console.info("telegram_bot_started", { username }),
    }).catch((error) => {
      console.error("telegram_bot_stopped_unexpectedly", { error: describeError(error) });
    });
  }

  requestShutdown(signal: "SIGINT" | "SIGTERM") {
    if (!this.shutdownPromise) this.shutdownPromise = this.shutdown(signal);
    return this.shutdownPromise;
  }

  private runTracked(name: string, operation: () => Promise<void>) {
    if (!this.acceptingWork) return Promise.resolve();
    const task = (async () => {
      try { await operation(); }
      catch (error) { console.error(`${name}_failed`, { error: describeError(error) }); }
    })();
    this.activeOperations.add(task);
    void task.finally(() => this.activeOperations.delete(task));
    return task;
  }

  private syncAlerts() {
    return this.runTracked("alert_sync", async () => {
      const coins = await this.evaluator.refresh();
      if (this.acceptingWork) this.stream.setCoins(coins);
    });
  }

  private syncMarketHistory() {
    return this.runTracked("market_history", async () => {
      const result = await this.history.record();
      console.info("market_history_recorded", result);
      if (this.acceptingWork && result.inserted > 0 && this.options.radar) {
        // Track for shutdown, but do not hold up WebSocket/polling startup.
        const radar = this.options.radar;
        void this.runTracked("radar_cycle", async () => {
          try { await radar.run(); }
          catch { console.error("radar_cycle_failed"); }
        });
      }
    });
  }

  private async shutdown(signal: "SIGINT" | "SIGTERM") {
    console.info("worker_stopping", { signal, timeoutMs: this.options.shutdownTimeoutMs });
    this.acceptingWork = false;
    if (this.alertTimer) clearInterval(this.alertTimer);
    if (this.historyTimer) clearInterval(this.historyTimer);
    this.alertTimer = null;
    this.historyTimer = null;

    this.evaluator.beginShutdown();
    this.options.radar?.stop();
    this.stream.stop();

    const stopBot = Promise.resolve()
      .then(() => this.bot.stop())
      .catch((error) => console.error("telegram_bot_stop_failed", { error: describeError(error) }));
    const drain = Promise.allSettled([
      ...this.activeOperations,
      this.evaluator.drain(),
      stopBot,
      this.botPolling ?? Promise.resolve(),
    ]).then(() => "drained" as const);

    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<"deadline">((resolve) => {
      deadlineTimer = setTimeout(() => resolve("deadline"), this.options.shutdownTimeoutMs);
    });
    const outcome = await Promise.race([drain, deadline]);
    if (deadlineTimer) clearTimeout(deadlineTimer);

    if (outcome === "deadline") {
      console.error("worker_shutdown_deadline_exceeded", {
        activeOperations: this.activeOperations.size,
        timeoutMs: this.options.shutdownTimeoutMs,
      });
    } else {
      console.info("worker_stopped", { signal });
    }
    this.exit(0);
  }
}
