import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { deleteAlert, disableAlert, enableAlert, rearmAlert } from "./actions";

describe("alert action ownership", () => {
  const viewerId = "11111111-1111-4111-8111-111111111111";
  const filters: Array<[string, unknown]> = [];
  const updates: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    filters.length = 0;
    updates.length = 0;
    mocks.getViewer.mockResolvedValue({ id: viewerId, email: "owner@example.com", preview: false });
    const query = {
      eq(column: string, value: unknown) { filters.push([column, value]); return query; },
      then(resolve: (value: { data: null; error: null }) => unknown) { return Promise.resolve({ data: null, error: null }).then(resolve); },
    };
    mocks.createClient.mockResolvedValue({
      from: () => ({
        update: (values: Record<string, unknown>) => { updates.push(values); return query; },
        delete: () => query,
      }),
    });
  });

  it.each([
    ["disable", disableAlert],
    ["enable", enableAlert],
    ["re-arm", rearmAlert],
    ["delete", deleteAlert],
  ])("scopes %s by both alert ID and authenticated user ID", async (_name, action) => {
    const formData = new FormData();
    formData.set("id", "another-users-alert");
    await action(formData);
    expect(filters).toContainEqual(["id", "another-users-alert"]);
    expect(filters).toContainEqual(["user_id", viewerId]);
  });

  it.each([
    ["enable", enableAlert],
    ["re-arm", rearmAlert],
  ])("explicitly requests a new arm generation when users %s an alert", async (_name, action) => {
    const formData = new FormData();
    formData.set("id", "alert-1");
    await action(formData);
    expect(updates).toEqual([expect.objectContaining({
      status: "active",
      arm_generation: 0,
      triggered_at: null,
      last_observed_price: null,
    })]);
  });

  it("does not advance the arm generation when disabling an alert", async () => {
    const formData = new FormData();
    formData.set("id", "alert-1");
    await disableAlert(formData);
    expect(updates).toEqual([{ status: "disabled" }]);
  });
});
