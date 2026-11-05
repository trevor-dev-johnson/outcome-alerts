import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runHostedIsolation = process.env.RUN_SUPABASE_ISOLATION_TESTS === "1";
const runLocalIsolation = process.env.RUN_LOCAL_SUPABASE_ISOLATION_TESTS === "1";
const describeIsolation = runHostedIsolation || runLocalIsolation ? describe : describe.skip;

describeIsolation("two-user Supabase isolation", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const password = `OddsUp-${randomUUID()}-Aa1!`;
  const suffix = randomUUID();
  const emailA = `security-a-${suffix}@example.com`;
  const emailB = `security-b-${suffix}@example.com`;

  let admin: SupabaseClient;
  let userA: User;
  let userB: User;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let sessionA: Session;
  let sessionB: Session;
  let alertB: string;
  let radarA: string;
  const markerA = `Browser isolation marker ${suffix}`;

  function authenticatedClient() {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  beforeAll(async () => {
    expect(url, "NEXT_PUBLIC_SUPABASE_URL is required").toBeTruthy();
    expect(serviceKey, "SUPABASE_SERVICE_ROLE_KEY is required").toBeTruthy();
    const appUrl = process.env.SECURITY_TEST_APP_URL;
    expect(appUrl, "SECURITY_TEST_APP_URL must be set explicitly").toBeTruthy();
    if (runLocalIsolation) {
      expect(["127.0.0.1", "localhost"]).toContain(new URL(url).hostname);
      expect(["127.0.0.1", "localhost"]).toContain(new URL(appUrl!).hostname);
    }

    admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ data: createdA, error: errorA }, { data: createdB, error: errorB }] = await Promise.all([
      admin.auth.admin.createUser({ email: emailA, password, email_confirm: true }),
      admin.auth.admin.createUser({ email: emailB, password, email_confirm: true }),
    ]);
    expect(errorA).toBeNull();
    expect(errorB).toBeNull();
    userA = createdA.user!;
    userB = createdB.user!;
    expect(userA.id).not.toBe(userB.id);

    clientA = authenticatedClient();
    clientB = authenticatedClient();
    const [{ data: signedInA, error: signInA }, { data: signedInB, error: signInB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: emailA, password }),
      clientB.auth.signInWithPassword({ email: emailB, password }),
    ]);
    expect(signInA).toBeNull();
    expect(signInB).toBeNull();
    sessionA = signedInA.session!;
    sessionB = signedInB.session!;

    const markerInsert = await clientA.from("alerts").insert({
      user_id: userA.id,
      market_id: "browser-cookie-isolation",
      market_name: markerA,
      outcome: "YES",
      operator: "above",
      threshold: 0.5,
      status: "active",
      last_observed_price: 0.4,
    });
    expect(markerInsert.error).toBeNull();

    const { data, error } = await clientB.from("alerts").insert({
      user_id: userB.id,
      market_id: "security-isolation",
      market_name: "Security isolation test",
      outcome: "YES",
      operator: "above",
      threshold: 0.5,
      status: "active",
      last_observed_price: 0.4,
    }).select("id").single();
    expect(error).toBeNull();
    alertB = data!.id;

    const { data: radar, error: radarError } = await clientA.rpc("create_radar_subscription", {
      p_kind: "category",
      p_target: "NBA",
      p_window: "5m",
      p_threshold: 5,
      p_consent: true,
    });
    expect(radarError).toBeNull();
    radarA = radar!;
  }, 30_000);

  afterAll(async () => {
    if (userA?.id) await admin.auth.admin.deleteUser(userA.id);
    if (userB?.id) await admin.auth.admin.deleteUser(userB.id);
  }, 30_000);

  it("changes authenticated identity and visible profile when accounts switch", async () => {
    const switchingClient = authenticatedClient();
    const { error: signInA } = await switchingClient.auth.signInWithPassword({ email: emailA, password });
    expect(signInA).toBeNull();
    expect((await switchingClient.auth.getUser()).data.user?.id).toBe(userA.id);
    expect((await switchingClient.from("profiles").select("id")).data).toEqual([{ id: userA.id }]);

    expect((await switchingClient.auth.signOut({ scope: "local" })).error).toBeNull();
    expect((await switchingClient.auth.getSession()).data.session).toBeNull();

    const { error: signInB } = await switchingClient.auth.signInWithPassword({ email: emailB, password });
    expect(signInB).toBeNull();
    expect((await switchingClient.auth.getUser()).data.user?.id).toBe(userB.id);
    expect((await switchingClient.from("profiles").select("id")).data).toEqual([{ id: userB.id }]);
  });

  it("replaces an existing session when a different user's magic link is verified", async () => {
    const switchingClient = authenticatedClient();
    await switchingClient.auth.signInWithPassword({ email: emailA, password });
    expect((await switchingClient.auth.getUser()).data.user?.id).toBe(userA.id);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: emailB,
    });
    expect(linkError).toBeNull();
    const tokenHash = link.properties?.hashed_token;
    expect(tokenHash).toBeTruthy();

    const { error: verifyError } = await switchingClient.auth.verifyOtp({
      token_hash: tokenHash!,
      type: "magiclink",
    });
    expect(verifyError).toBeNull();
    expect((await switchingClient.auth.getUser()).data.user?.id).toBe(userB.id);
    expect((await switchingClient.from("profiles").select("id")).data).toEqual([{ id: userB.id }]);
  });

  it("switches the SSR browser cookie identity without rendering User A's alerts to User B", async () => {
    async function cookieHeader(session: Session) {
      const jar = new Map<string, string>();
      const client = createServerClient(url, serviceKey, {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (cookies) => {
            for (const cookie of cookies) {
              if (cookie.value) jar.set(cookie.name, cookie.value);
              else jar.delete(cookie.name);
            }
          },
        },
      });
      const { error } = await client.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      expect(error).toBeNull();
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    }

    const appUrl = process.env.SECURITY_TEST_APP_URL!;
    const headersA = { cookie: await cookieHeader(sessionA) };
    const [settingsA, alertsA, radarPageA] = await Promise.all([
      fetch(`${appUrl}/settings`, { headers: headersA }).then((response) => response.text()),
      fetch(`${appUrl}/alerts`, { headers: headersA }).then((response) => response.text()),
      fetch(`${appUrl}/radar`, { headers: headersA }).then((response) => response.text()),
    ]);
    expect(settingsA).toContain(emailA);
    expect(alertsA).toContain(markerA);
    expect(radarPageA).toContain("NBA markets");

    const headersB = { cookie: await cookieHeader(sessionB) };
    const [settingsB, alertsB, radarPageB] = await Promise.all([
      fetch(`${appUrl}/settings`, { headers: headersB }).then((response) => response.text()),
      fetch(`${appUrl}/alerts`, { headers: headersB }).then((response) => response.text()),
      fetch(`${appUrl}/radar`, { headers: headersB }).then((response) => response.text()),
    ]);
    expect(settingsB).toContain(emailB);
    expect(settingsB).not.toContain(emailA);
    expect(alertsB).not.toContain(markerA);
    expect(radarPageB).not.toContain("NBA markets");
  }, 20_000);

  it("prevents User A from reading or mutating User B's alert", async () => {
    const read = await clientA.from("alerts").select("id,status,user_id").eq("id", alertB);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    for (const status of ["disabled", "active"] as const) {
      const mutation = await clientA.from("alerts").update({ status }).eq("id", alertB).select("id");
      expect(mutation.error).toBeNull();
      expect(mutation.data).toEqual([]);
    }

    const removal = await clientA.from("alerts").delete().eq("id", alertB).select("id");
    expect(removal.error).toBeNull();
    expect(removal.data).toEqual([]);

    const forgedInsert = await clientA.from("alerts").insert({
      user_id: userB.id,
      market_id: "forged-owner",
      market_name: "Forged owner test",
      outcome: "YES",
      operator: "above",
      threshold: 0.5,
    });
    expect(forgedInsert.error).not.toBeNull();

    const ownerRead = await clientB.from("alerts").select("id,status,user_id").eq("id", alertB).single();
    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data).toEqual({ id: alertB, status: "active", user_id: userB.id });
  });

  it("enforces Radar ownership, RPC permissions, and generation invalidation", async () => {
    const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    expect((await anonymous.from("radar_subscriptions").select("id")).error).not.toBeNull();
    expect((await anonymous.rpc("create_radar_subscription", {
      p_kind: "category", p_target: "NBA", p_window: "5m", p_threshold: 5, p_consent: true,
    })).error).not.toBeNull();

    expect((await clientB.from("radar_subscriptions").select("id").eq("id", radarA)).data).toEqual([]);
    expect((await clientB.rpc("manage_radar_subscription", { p_id: radarA, p_operation: "pause" })).data).toBe(false);

    const directInsert = await clientB.from("radar_subscriptions").insert({
      user_id: userB.id,
      target_kind: "category",
      target: "NFL",
      window_name: "5m",
      threshold_points: 5,
    });
    expect(directInsert.error).not.toBeNull();

    const unauthorizedClaim = await clientA.rpc("claim_radar_event", {
      p_subscription: radarA,
      p_generation: 1,
      p_market: "424242",
      p_current_bucket: new Date().toISOString(),
      p_baseline_bucket: new Date(Date.now() - 300_000).toISOString(),
      p_event: randomUUID(),
    });
    expect(unauthorizedClaim.error).not.toBeNull();

    expect((await clientA.rpc("manage_radar_subscription", { p_id: radarA, p_operation: "pause" })).data).toBe(true);
    expect((await clientA.from("radar_subscriptions").select("generation,paused").eq("id", radarA).single()).data)
      .toEqual({ generation: 2, paused: true });
    expect((await clientA.rpc("manage_radar_subscription", { p_id: radarA, p_operation: "resume" })).data).toBe(true);
    expect((await clientA.from("radar_subscriptions").select("generation,paused").eq("id", radarA).single()).data)
      .toEqual({ generation: 3, paused: false });

    const marketId = Date.now().toString();
    const eventId = randomUUID();
    const now = Date.now();
    const currentBucket = new Date(Math.floor(now / 300_000) * 300_000);
    const currentObserved = new Date(now);
    const baselineBucket = new Date(currentBucket.getTime() - 300_000);
    const baselineObserved = new Date(currentObserved.getTime() - 300_000);
    expect((await admin.from("profiles").update({
      telegram_user_id: 1001,
      telegram_chat_id: 1001,
      telegram_connected_at: new Date().toISOString(),
    }).eq("id", userA.id)).error).toBeNull();
    expect((await admin.from("market_probability_observations").insert([
      { market_id: marketId, bucket_at: baselineBucket.toISOString(), observed_at: baselineObserved.toISOString(), yes_probability: 0.4 },
      { market_id: marketId, bucket_at: currentBucket.toISOString(), observed_at: currentObserved.toISOString(), yes_probability: 0.5 },
    ])).error).toBeNull();
    const claimed = await admin.rpc("claim_radar_event", {
      p_subscription: radarA,
      p_generation: 3,
      p_market: marketId,
      p_current_bucket: currentBucket.toISOString(),
      p_baseline_bucket: baselineBucket.toISOString(),
      p_event: eventId,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toBe(true);
    expect((await clientA.from("radar_events").select("id,status").eq("id", eventId)).data)
      .toEqual([{ id: eventId, status: "reserved" }]);
    expect((await clientB.from("radar_events").select("id").eq("id", eventId)).data).toEqual([]);

    expect((await clientA.rpc("manage_radar_subscription", { p_id: radarA, p_operation: "pause" })).data).toBe(true);
    expect((await admin.rpc("begin_radar_delivery", { p_event: eventId })).data).toBeNull();
    expect((await clientA.from("radar_events").select("status").eq("id", eventId).single()).data)
      .toEqual({ status: "cancelled" });

    expect((await clientA.rpc("manage_radar_subscription", { p_id: radarA, p_operation: "remove" })).data).toBe(true);
    expect((await clientA.from("radar_subscriptions").select("id").eq("id", radarA)).data).toEqual([]);
  });
});
