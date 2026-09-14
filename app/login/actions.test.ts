import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  clearLocalSession: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/session", () => ({ clearLocalSession: mocks.clearLocalSession }));

import { sendMagicLink } from "./actions";

describe("sendMagicLink session switching", () => {
  const signInWithOtp = vi.fn();
  const client = { auth: { signInWithOtp } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(client);
    mocks.clearLocalSession.mockResolvedValue(null);
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it("clears the previous local session before starting the new magic-link flow", async () => {
    const formData = new FormData();
    formData.set("email", "second@example.com");
    await expect(sendMagicLink({}, formData)).resolves.toEqual({ message: "Magic link sent. Check your inbox." });
    expect(mocks.clearLocalSession).toHaveBeenCalledWith(client);
    expect(mocks.clearLocalSession.mock.invocationCallOrder[0]).toBeLessThan(signInWithOtp.mock.invocationCallOrder[0]);
  });

  it("does not start another login while the previous session cannot be cleared", async () => {
    mocks.clearLocalSession.mockResolvedValue(new Error("failed"));
    const formData = new FormData();
    formData.set("email", "second@example.com");
    await expect(sendMagicLink({}, formData)).resolves.toEqual({
      error: "Could not clear the previous session. Please try again.",
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
