import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlertList } from "./alert-list";
import type { Alert } from "@/lib/types";

const alert: Alert = {
  id: "alert-1",
  user_id: "user-1",
  market_id: "42",
  market_name: "Will Boston beat New York?",
  outcome: "YES",
  operator: "above",
  threshold: 0.7,
  status: "active",
  arm_generation: 1,
  last_observed_price: 0.64,
  triggered_at: null,
  created_at: "2026-11-15T12:00:00.000Z",
  updated_at: "2026-11-15T12:00:00.000Z",
};

describe("AlertList", () => {
  it("keeps saved alert facts and management actions visible", () => {
    const html = renderToStaticMarkup(createElement(AlertList, { alerts: [alert] }));

    expect(html).toContain("Will Boston beat New York?");
    expect(html).toContain("YES");
    expect(html).toContain("above");
    expect(html).toContain("70.0%");
    expect(html).toContain("64.0%");
    expect(html).toContain("active");
    expect(html).toContain("Disable");
    expect(html).toContain("Delete");
  });

  it("gives the empty state one clear next action", () => {
    const html = renderToStaticMarkup(createElement(AlertList, { alerts: [] }));

    expect(html).toContain('href="/markets"');
    expect(html).toContain("Browse markets");
  });
});
