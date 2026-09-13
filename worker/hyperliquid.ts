import WebSocket from "ws";

type PriceHandler = (coin: string, price: number) => void | Promise<void>;

export class HyperliquidStream {
  private socket: WebSocket | null = null;
  private coins = new Set<string>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly onPrice: PriceHandler,
  ) {}

  start() { this.stopped = false; this.connect(); }
  stop() { this.stopped = true; if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.socket?.close(); }

  setCoins(nextCoins: Iterable<string>) {
    const next = new Set(nextCoins);
    for (const coin of this.coins) if (!next.has(coin)) this.send("unsubscribe", coin);
    for (const coin of next) if (!this.coins.has(coin)) this.send("subscribe", coin);
    this.coins = next;
  }

  private connect() {
    if (this.stopped) return;
    console.info("hyperliquid_connecting", { url: this.url, attempt: this.reconnectAttempt + 1 });
    this.socket = new WebSocket(this.url);
    this.socket.on("open", () => {
      this.reconnectAttempt = 0;
      console.info("hyperliquid_connected", { subscriptions: this.coins.size });
      for (const coin of this.coins) this.send("subscribe", coin);
    });
    this.socket.on("message", (raw) => this.handleMessage(String(raw)));
    this.socket.on("error", (error) => console.error("hyperliquid_socket_error", { error: error.message }));
    this.socket.on("close", (code) => {
      console.warn("hyperliquid_disconnected", { code });
      if (this.stopped) return;
      const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++) + Math.floor(Math.random() * 500);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  private send(method: "subscribe" | "unsubscribe", coin: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ method, subscription: { type: "activeAssetCtx", coin } }));
  }

  private handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as { channel?: string; data?: { coin?: string; ctx?: Record<string,string>; midPx?: string; markPx?: string } };
      if (!["activeAssetCtx", "activeSpotAssetCtx"].includes(message.channel ?? "") || !message.data?.coin) return;
      const price = Number(message.data.ctx?.midPx ?? message.data.midPx ?? message.data.ctx?.markPx ?? message.data.markPx);
      if (Number.isFinite(price)) void this.onPrice(message.data.coin, price);
    } catch (error) { console.warn("hyperliquid_message_invalid", { error: error instanceof Error ? error.message : String(error) }); }
  }
}
