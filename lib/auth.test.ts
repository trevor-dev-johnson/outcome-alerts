import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getAlerts } from "./auth";

describe("getAlerts ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds an authenticated user filter even when RLS is enabled", async () => {
    const viewerId = "11111111-1111-4111-8111-111111111111";
    const eq = vi.fn(() => ({ order: async () => ({ data: [], error: null }) }));
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: viewerId, email: "owner@example.com" } } }) },
      from: () => ({ select: () => ({ eq }) }),
    });

    await expect(getAlerts()).resolves.toEqual([]);
    expect(eq).toHaveBeenCalledWith("user_id", viewerId);
  });
});
