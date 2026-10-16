import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(), createClient: vi.fn(), rpc: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { disconnectTelegram } from "./actions";

describe("Telegram disconnect ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({ id: "caller", preview: false });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("calls only the zero-argument authenticated RPC, never a direct profile update", async () => {
    await disconnectTelegram();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("disconnect_telegram");
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/settings");
  });

  it.each([null, { id: "preview", preview: true }])("does nothing for a non-authenticated viewer: %s", async (viewer) => {
    mocks.getViewer.mockResolvedValue(viewer);
    await disconnectTelegram();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: "internal database details" } },
    { data: false, error: null },
  ])("reports a safe failure rather than claiming success", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    await expect(disconnectTelegram()).rejects.toThrow("redirect:/settings?error=telegram-disconnect");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
