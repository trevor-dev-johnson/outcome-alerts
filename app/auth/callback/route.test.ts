import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  clearLocalSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/session", () => ({ clearLocalSession: mocks.clearLocalSession }));

import { GET } from "./route";

describe("auth callback session isolation", () => {
  const exchangeCodeForSession = vi.fn();
  const client = { auth: { exchangeCodeForSession } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(client);
    mocks.clearLocalSession.mockResolvedValue(null);
  });

  it("keeps the newly exchanged session on success", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("https://oddsup.xyz/auth/callback?code=valid&next=/alerts"));
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/alerts");
    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
  });

  it("clears an existing session when code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code") });
    const response = await GET(new NextRequest("https://oddsup.xyz/auth/callback?code=invalid"));
    expect(mocks.clearLocalSession).toHaveBeenCalledWith(client);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=auth");
  });

  it("clears an existing session when the callback has no code", async () => {
    const response = await GET(new NextRequest("https://oddsup.xyz/auth/callback"));
    expect(mocks.clearLocalSession).toHaveBeenCalledWith(client);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=auth");
  });
});
