import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { HyperliquidStream } from "./hyperliquid";

describe("Hyperliquid alert price stream", () => {
  beforeEach(() => {
    websocketState.instances.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
});
