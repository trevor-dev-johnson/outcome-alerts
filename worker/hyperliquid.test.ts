import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: unknown[]) => void;

const websocketState = vi.hoisted(() => ({
  instances: [] as Array<{
    emit: (event: string, ...args: unknown[]) => void;
    sent: string[];
  }>,
}));

vi.mock("ws", () => {
  class FakeWebSocket {
    static readonly OPEN = 1;
    readonly sent: string[] = [];
    readonly listeners = new Map<string, Listener[]>();
    readyState = FakeWebSocket.OPEN;

    constructor(readonly url: string) {
      websocketState.instances.push(this);
    }

    on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    send(message: string) {
      this.sent.push(message);
    }

    close() {
      this.emit("close", 1000);
    }
  }

  return { default: FakeWebSocket };
});

import { HYPERLIQUID_HEARTBEAT_INTERVAL_MS, HyperliquidStream } from "./hyperliquid";

describe("Hyperliquid alert price stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    websocketState.instances.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("evaluates loaded-alert prices directly from WebSocket messages", () => {
    const onPrice = vi.fn();
    const stream = new HyperliquidStream("wss://example.test/ws", onPrice);
    stream.setCoins(["#1010"]);
    stream.start();

    const socket = websocketState.instances[0];
    socket.emit("open");
    socket.emit("message", JSON.stringify({
      channel: "activeAssetCtx",
      data: { coin: "#1010", ctx: { midPx: "0.61" } },
    }));

    expect(onPrice).toHaveBeenCalledOnce();
    expect(onPrice).toHaveBeenCalledWith("#1010", 0.61);
    expect(socket.sent).toContain(JSON.stringify({
      method: "subscribe",
      subscription: { type: "activeAssetCtx", coin: "#1010" },
    }));

    stream.stop();
  });

  it("sends one application heartbeat every 50 seconds and ignores pong messages", () => {
    const onPrice = vi.fn();
    const stream = new HyperliquidStream("wss://example.test/ws", onPrice);
    stream.start();

    const socket = websocketState.instances[0];
    socket.emit("open");
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(HYPERLIQUID_HEARTBEAT_INTERVAL_MS - 1);
    expect(socket.sent).not.toContain(JSON.stringify({ method: "ping" }));
    vi.advanceTimersByTime(1);
    expect(socket.sent).toEqual([JSON.stringify({ method: "ping" })]);

    socket.emit("message", JSON.stringify({ channel: "pong" }));
    expect(onPrice).not.toHaveBeenCalled();

    stream.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replaces the heartbeat on reconnect and restores each subscription once", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const onPrice = vi.fn();
    const stream = new HyperliquidStream("wss://example.test/ws", onPrice);
    stream.setCoins(["#1010", "#1011"]);
    stream.start();
    stream.start();

    expect(websocketState.instances).toHaveLength(1);
    const firstSocket = websocketState.instances[0];
    firstSocket.emit("open");
    expect(firstSocket.sent).toEqual([
      JSON.stringify({ method: "subscribe", subscription: { type: "activeAssetCtx", coin: "#1010" } }),
      JSON.stringify({ method: "subscribe", subscription: { type: "activeAssetCtx", coin: "#1011" } }),
    ]);

    firstSocket.emit("close", 1006);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(websocketState.instances).toHaveLength(2);

    const secondSocket = websocketState.instances[1];
    secondSocket.emit("open");
    expect(vi.getTimerCount()).toBe(1);
    expect(secondSocket.sent).toEqual([
      JSON.stringify({ method: "subscribe", subscription: { type: "activeAssetCtx", coin: "#1010" } }),
      JSON.stringify({ method: "subscribe", subscription: { type: "activeAssetCtx", coin: "#1011" } }),
    ]);

    vi.advanceTimersByTime(HYPERLIQUID_HEARTBEAT_INTERVAL_MS);
    expect(firstSocket.sent).not.toContain(JSON.stringify({ method: "ping" }));
    expect(secondSocket.sent.filter((message) => message === JSON.stringify({ method: "ping" }))).toHaveLength(1);

    secondSocket.emit("message", JSON.stringify({
      channel: "activeAssetCtx",
      data: { coin: "#1010", ctx: { midPx: "0.62" } },
    }));
    expect(onPrice).toHaveBeenCalledOnce();
    expect(onPrice).toHaveBeenCalledWith("#1010", 0.62);

    stream.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
