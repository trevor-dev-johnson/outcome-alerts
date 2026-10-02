import WebSocket from "ws";

type PriceHandler = (coin: string, price: number) => void | Promise<void>;

export const HYPERLIQUID_HEARTBEAT_INTERVAL_MS = 50_000;

export class HyperliquidStream {
  private socket: WebSocket | null = null;
  private coins = new Set<string>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = true;

  constructor(
    private readonly url: string,
    private readonly onPrice: PriceHandler,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearHeartbeat();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  setCoins(nextCoins: Iterable<string>) {
    const next = new Set(nextCoins);
    for (const coin of this.coins) if (!next.has(coin)) this.send("unsubscribe", coin);
    for (const coin of next) if (!this.coins.has(coin)) this.send("subscribe", coin);
    this.coins = next;
  }

  private connect() {
    if (this.stopped) return;
    console.info("hyperliquid_connecting", { url: this.url, attempt: this.reconnectAttempt + 1 });
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.on("open", () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectAttempt = 0;
      console.info("hyperliquid_connected", { subscriptions: this.coins.size });
      for (const coin of this.coins) this.send("subscribe", coin);
      this.startHeartbeat(socket);
    });
    socket.on("message", (raw) => {
      if (this.socket === socket) this.handleMessage(String(raw));
    });
    socket.on("error", (error) => console.error("hyperliquid_socket_error", { error: error.message }));
    socket.on("close", (code) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearHeartbeat();
      console.warn("hyperliquid_disconnected", { code });
      if (this.stopped) return;
      const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++) + Math.floor(Math.random() * 500);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    });
  }

  private startHeartbeat(socket: WebSocket) {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ method: "ping" }));
      console.debug("hyperliquid_heartbeat_sent");
    }, HYPERLIQUID_HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private send(method: "subscribe" | "unsubscribe", coin: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ method, subscription: { type: "activeAssetCtx", coin } }));
  }

  private handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as { channel?: string; data?: { coin?: string; ctx?: Record<string,string>; midPx?: string; markPx?: string } };
      if (message.channel === "pong") {
        console.debug("hyperliquid_heartbeat_received");
        return;
      }
      if (!["activeAssetCtx", "activeSpotAssetCtx"].includes(message.channel ?? "") || !message.data?.coin) return;
      const price = Number(message.data.ctx?.midPx ?? message.data.midPx ?? message.data.ctx?.markPx ?? message.data.markPx);
      if (Number.isFinite(price)) void this.onPrice(message.data.coin, price);
    } catch (error) { console.warn("hyperliquid_message_invalid", { error: error instanceof Error ? error.message : String(error) }); }
  }
}
