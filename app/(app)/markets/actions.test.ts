import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { createAlert } from "./actions";

describe("createAlert ownership", () => {
  const viewerId = "11111111-1111-4111-8111-111111111111";
  const insert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({ id: viewerId, email: "owner@example.com", preview: false });
    insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: "alert-id" }, error: null }) }),
    });
    mocks.createClient.mockResolvedValue({
      from(table: string) {
        if (table === "alerts") return { insert };
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { telegram_chat_id: null }, error: null }) }),
          }),
        };
      },
    });
  });

  it("ignores a forged client user_id and inserts the authenticated UUID", async () => {
    const formData = new FormData();
    formData.set("marketId", "42");
    formData.set("marketName", "Isolation market");
    formData.set("outcome", "YES");
    formData.set("operator", "above");
    formData.set("threshold", "60");
    formData.set("currentPrice", "0.4");
    formData.set("user_id", "22222222-2222-4222-8222-222222222222");

    await createAlert({}, formData);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: viewerId }));
    expect(insert.mock.calls[0][0].user_id).not.toBe(formData.get("user_id"));
  });
});
