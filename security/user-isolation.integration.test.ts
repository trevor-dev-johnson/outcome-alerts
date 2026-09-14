import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runProductionIsolation = process.env.RUN_SUPABASE_ISOLATION_TESTS === "1";
const describeIsolation = runProductionIsolation ? describe : describe.skip;

describeIsolation("production two-user isolation", () => {
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
  let alertB: string;

  function authenticatedClient() {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  beforeAll(async () => {
    expect(url, "NEXT_PUBLIC_SUPABASE_URL is required").toBeTruthy();
    expect(serviceKey, "SUPABASE_SERVICE_ROLE_KEY is required").toBeTruthy();

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
    const [{ error: signInA }, { error: signInB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: emailA, password }),
      clientB.auth.signInWithPassword({ email: emailB, password }),
    ]);
    expect(signInA).toBeNull();
    expect(signInB).toBeNull();

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
});
