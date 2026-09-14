import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bot } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "@/lib/types";
import { AlertEvaluator } from "./alerts";

type QueryResult<T> = { data: T; error: unknown };
type Claim = { claimId: string; chatId: string; crossingPrice: number; completed: boolean };

class FakeQuery implements PromiseLike<QueryResult<unknown>> {
  private action: "select" | "update" = "select";
  private values: Record<string, unknown> = {};
  private filters = new Map<string, unknown>();
  private inFilter: { column: string; values: unknown[] } | null = null;

  constructor(private readonly database: FakeSupabase, private readonly table: string) {}

  select() { this.action = "select"; return this; }
  update(values: Record<string, unknown>) { this.action = "update"; this.values = values; return this; }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  in(column: string, values: unknown[]) { this.inFilter = { column, values }; return this; }

  private async execute(): Promise<QueryResult<unknown>> {
    if (this.table === "alerts" && this.action === "select") {
      const alerts = this.database.alerts.filter((alert) =>
        [...this.filters].every(([column, value]) => alert[column as keyof Alert] === value),
      );
      return { data: alerts.map((alert) => ({ ...alert })), error: null };
    }

    if (this.table === "alert_delivery_claims" && this.action === "select") {
      const ids = new Set(this.inFilter?.values.map(String) ?? []);
      return {
        data: [...this.database.claims.keys()].filter((id) => ids.has(id)).map((alert_id) => ({ alert_id })),
        error: null,
      };
    }

    if (this.table === "alerts" && this.action === "update") {
      this.database.baselineUpdateCalls += 1;
      for (const alert of this.database.alerts) {
        if ([...this.filters].every(([column, value]) => alert[column as keyof Alert] === value)) {
          Object.assign(alert, this.values);
        }
      }
      return { data: null, error: null };
    }

    throw new Error(`Unsupported fake query: ${this.table} ${this.action}`);
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class FakeSupabase {
  readonly claims = new Map<string, Claim>();
  claimCalls = 0;
  completeCalls = 0;
  baselineUpdateCalls = 0;
  claimResponseTimeoutsRemaining = 0;
  completionFailuresRemaining = 0;
  telegramChatId: string | null = "123456";

  constructor(readonly alerts: Alert[]) {}

  from(table: string) { return new FakeQuery(this, table); }

  async rpc(name: string, params: Record<string, unknown>): Promise<QueryResult<unknown>> {
    if (name === "claim_alert_delivery") {
      this.claimCalls += 1;
      const alertId = String(params.p_alert_id);
      const claimId = String(params.p_claim_id);
      const existing = this.claims.get(alertId);
      if (existing) return { data: existing.claimId === claimId ? existing.chatId : null, error: null };
      const alert = this.alerts.find((candidate) => candidate.id === alertId && candidate.status === "active");
      if (!alert || !this.telegramChatId) return { data: null, error: null };
      this.claims.set(alertId, {
        claimId,
        chatId: this.telegramChatId,
        crossingPrice: Number(params.p_current_price),
        completed: false,
      });
      if (this.claimResponseTimeoutsRemaining > 0) {
        this.claimResponseTimeoutsRemaining -= 1;
        return { data: null, error: { status: 504, message: "Gateway Timeout" } };
      }
      return { data: this.telegramChatId, error: null };
    }

    if (name === "complete_alert_delivery") {
      this.completeCalls += 1;
      if (this.completionFailuresRemaining > 0) {
        this.completionFailuresRemaining -= 1;
        return { data: null, error: { status: 504, message: "Gateway Timeout" } };
      }
      const alertId = String(params.p_alert_id);
      const claim = this.claims.get(alertId);
      if (!claim || claim.claimId !== String(params.p_claim_id)) return { data: false, error: null };
      if (!claim.completed) {
        const alert = this.alerts.find((candidate) => candidate.id === alertId);
        if (!alert || alert.status !== "active") return { data: false, error: null };
        alert.status = "triggered";
        alert.triggered_at = new Date().toISOString();
        alert.last_observed_price = claim.crossingPrice;
        claim.completed = true;
      }
      return { data: true, error: null };
    }

    throw new Error(`Unsupported fake RPC: ${name}`);
  }
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-1",
    user_id: "user-1",
    market_id: "1",
    market_name: "Will the test pass?",
    outcome: "YES",
    operator: "above",
    threshold: 0.5,
    status: "active",
    last_observed_price: 0.4,
    triggered_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function setup(database: FakeSupabase, options: { now?: () => number; maxAttempts?: number } = {}) {
  const sendMessage = vi.fn(async () => ({ message_id: 1 }));
  let claimNumber = 0;
  const evaluator = new AlertEvaluator(
    database as unknown as SupabaseClient,
    { api: { sendMessage } } as unknown as Bot,
    {
      now: options.now,
      createClaimId: () => `claim-${++claimNumber}`,
      retry: {
        maxAttempts: options.maxAttempts ?? 4,
        baseDelayMs: 1,
        maxDelayMs: 4,
        sleep: async () => undefined,
      },
    },
  );
  return { evaluator, sendMessage };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("AlertEvaluator delivery claims", () => {
  it("allows only one Telegram delivery for concurrent crossing events", async () => {
    const database = new FakeSupabase([alert()]);
    const { evaluator, sendMessage } = setup(database);
    await evaluator.refresh();

    await Promise.all([
      evaluator.onPrice("#10", 0.6),
      evaluator.onPrice("#10", 0.61),
      evaluator.onPrice("#10", 0.62),
    ]);

    expect(database.claimCalls).toBe(3);
    expect(database.claims.size).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(database.completeCalls).toBe(1);
    expect(database.alerts[0].status).toBe("triggered");
  });

  it("retries idempotent completion without sending Telegram again", async () => {
    const database = new FakeSupabase([alert()]);
    database.completionFailuresRemaining = 2;
    const { evaluator, sendMessage } = setup(database);
    await evaluator.refresh();

    await evaluator.onPrice("#10", 0.6);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(database.completeCalls).toBe(3);
    expect(database.alerts[0].status).toBe("triggered");
    expect(database.claims.get("alert-1")?.completed).toBe(true);
  });

  it("reuses the same claim after an ambiguous claim response timeout", async () => {
    const database = new FakeSupabase([alert()]);
    database.claimResponseTimeoutsRemaining = 1;
    const { evaluator, sendMessage } = setup(database);
    await evaluator.refresh();

    await evaluator.onPrice("#10", 0.6);

    expect(database.claimCalls).toBe(2);
    expect(database.claims.size).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(database.alerts[0].status).toBe("triggered");
  });

  it("never redelivers after Telegram succeeds when every completion attempt times out", async () => {
    const database = new FakeSupabase([alert()]);
    database.completionFailuresRemaining = 10;
    const { evaluator, sendMessage } = setup(database, { maxAttempts: 3 });
    await evaluator.refresh();

    await evaluator.onPrice("#10", 0.6);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(database.completeCalls).toBe(3);
    expect(database.alerts[0].status).toBe("active");

    expect(await evaluator.refresh()).toHaveLength(0);
    await evaluator.onPrice("#10", 0.7);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("AlertEvaluator baseline persistence", () => {
  it("writes on threshold-side changes and periodic checkpoints, not every price tick", async () => {
    let now = 0;
    const database = new FakeSupabase([alert({ threshold: 0.7 })]);
    database.telegramChatId = null;
    const { evaluator } = setup(database, { now: () => now });
    await evaluator.refresh();

    await evaluator.onPrice("#10", 0.41);
    await evaluator.onPrice("#10", 0.42);
    await evaluator.onPrice("#10", 0.43);
    expect(database.baselineUpdateCalls).toBe(0);

    await evaluator.onPrice("#10", 0.8);
    await evaluator.onPrice("#10", 0.81);
    expect(database.baselineUpdateCalls).toBe(1);

    now = 5 * 60_000;
    await evaluator.onPrice("#10", 0.82);
    expect(database.baselineUpdateCalls).toBe(2);
  });

  it("persists the armed side for a below alert so a restart still detects the crossing", async () => {
    const database = new FakeSupabase([alert({ operator: "below", threshold: 0.5, last_observed_price: 0.5 })]);
    database.telegramChatId = null;
    const firstWorker = setup(database).evaluator;
    await firstWorker.refresh();

    await firstWorker.onPrice("#10", 0.6);
    expect(database.baselineUpdateCalls).toBe(1);
    expect(database.alerts[0].last_observed_price).toBe(0.6);

    database.telegramChatId = "123456";
    const { evaluator: restartedWorker, sendMessage } = setup(database);
    await restartedWorker.refresh();
    await restartedWorker.onPrice("#10", 0.5);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(database.alerts[0].status).toBe("triggered");
  });
});

