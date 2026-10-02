import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getAlerts, getAuthContext } from "./auth";

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

  it("loads the viewer and profile with only one authentication check", async () => {
    const viewerId = "11111111-1111-4111-8111-111111111111";
    const getUser = vi.fn(async () => ({
      data: { user: { id: viewerId, email: "owner@example.com" } },
    }));
    mocks.createClient.mockResolvedValue({
      auth: { getUser },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: viewerId, telegram_chat_id: "chat-1" } }),
          }),
        }),
      }),
    });

    await expect(getAuthContext()).resolves.toEqual({
      viewer: { id: viewerId, email: "owner@example.com", preview: false },
      profile: { id: viewerId, telegram_chat_id: "chat-1" },
    });
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
