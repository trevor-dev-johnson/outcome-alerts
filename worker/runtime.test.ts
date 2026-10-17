import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerRuntime } from "./runtime";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function harness(options: {
  refresh?: () => Promise<Set<string>>;
  record?: () => Promise<{ inserted: number; cleaned: boolean }>;
  drain?: () => Promise<void>;
} = {}) {
  const polling = deferred<void>();
  const evaluator = {
    refresh: vi.fn(options.refresh ?? (async () => new Set(["#10"]))),
    beginShutdown: vi.fn(),
    drain: vi.fn(options.drain ?? (async () => undefined)),
  };
  const stream = {
    setCoins: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const history = {
    record: vi.fn(options.record ?? (async () => ({ inserted: 1, cleaned: false }))),
  };
  const bot = {
    start: vi.fn(() => polling.promise),
    stop: vi.fn(async () => { polling.resolve(); }),
  };
  const exit = vi.fn();
  const runtime = new WorkerRuntime(evaluator, stream, history, bot, {
    alertSyncIntervalMs: 30_000,
    historyIntervalMs: 300_000,
    shutdownTimeoutMs: 20_000,
    exit,
  });
  return { runtime, evaluator, stream, history, bot, exit };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WorkerRuntime graceful shutdown", () => {
  it("stops intake and drains an idle worker", async () => {
    const { runtime, evaluator, stream, bot, exit } = harness();
    await runtime.start();

    await runtime.requestShutdown("SIGTERM");

    expect(evaluator.beginShutdown).toHaveBeenCalledTimes(1);
    expect(evaluator.drain).toHaveBeenCalledTimes(1);
    expect(stream.stop).toHaveBeenCalledTimes(1);
    expect(bot.stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("makes repeated SIGTERM and SIGINT requests idempotent", async () => {
    const { runtime, evaluator, stream, bot, exit } = harness();
    await runtime.start();

    const first = runtime.requestShutdown("SIGTERM");
    const second = runtime.requestShutdown("SIGINT");
    expect(second).toBe(first);
    await Promise.all([first, second]);

    expect(evaluator.beginShutdown).toHaveBeenCalledTimes(1);
    expect(stream.stop).toHaveBeenCalledTimes(1);
    expect(bot.stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("accounts for shutdown during initial alert synchronization", async () => {
    const refresh = deferred<Set<string>>();
    const { runtime, stream, exit } = harness({ refresh: () => refresh.promise });
    const starting = runtime.start();

    const stopping = runtime.requestShutdown("SIGTERM");
    refresh.resolve(new Set(["#10"]));
    await Promise.all([starting, stopping]);

    expect(stream.setCoins).not.toHaveBeenCalled();
    expect(stream.start).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("accounts for shutdown during initial history recording", async () => {
    const recording = deferred<{ inserted: number; cleaned: boolean }>();
    const { runtime, stream, exit } = harness({ record: () => recording.promise });
    const starting = runtime.start();

    const stopping = runtime.requestShutdown("SIGINT");
    recording.resolve({ inserted: 239, cleaned: false });
    await Promise.all([starting, stopping]);

    expect(stream.start).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("does not start interval work after shutdown begins", async () => {
    const { runtime, evaluator, history } = harness();
    await runtime.start();
    await runtime.requestShutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(600_000);

    expect(evaluator.refresh).toHaveBeenCalledTimes(1);
    expect(history.record).toHaveBeenCalledTimes(1);
  });

  it("exits cleanly when a hanging operation reaches the deadline", async () => {
    const never = new Promise<void>(() => undefined);
    const { runtime, exit } = harness({ drain: () => never });
    await runtime.start();

    const stopping = runtime.requestShutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(20_000);
    await stopping;

    expect(console.error).toHaveBeenCalledWith(
      "worker_shutdown_deadline_exceeded",
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
    expect(exit).toHaveBeenCalledWith(0);
  });
});
