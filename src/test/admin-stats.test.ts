import { describe, expect, it } from "vitest";
import { platformStats } from "@/lib/admin-stats";

const now = new Date("2026-10-25T12:00:00Z");
const co = (plan: string, subscription_status: string, created_at = "2026-01-01T00:00:00Z", trial_ends_at = "2026-12-31T00:00:00Z") => ({ plan, subscription_status, created_at, trial_ends_at });

describe("platformStats", () => {
  it("counts only active companies toward monthly revenue", () => {
    const s = platformStats([co("starter", "active"), co("growth", "active"), co("pro", "trialing"), co("pro", "suspended")], now);
    expect(s.mrr).toBe(49 + 129);
    expect(s.trialMrr).toBe(249);
  });
  it("counts new companies this month", () => {
    expect(platformStats([co("starter", "trialing", "2026-10-02T00:00:00Z"), co("starter", "active", "2026-09-02T00:00:00Z")], now).newThisMonth).toBe(1);
  });
});
