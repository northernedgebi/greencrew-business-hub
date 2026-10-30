import { describe, expect, it } from "vitest";
import { snowCharge, needsSnowReview } from "@/lib/snow-pricing";
import { categoryServiceForm, servicePayload, customerYearTotals } from "@/lib/customer-services";

describe("snow pricing", () => {
  it("bills rate times reported inches", () => expect(snowCharge("per_inch", 20, 4.5)).toBe(90));
  it("flags completed per-inch work until reviewed", () => expect(needsSnowReview({ pricing_mode: "per_inch", status: "completed", snow_reviewed_at: null })).toBe(true));
  it("clears the flag after office approval", () => expect(needsSnowReview({ pricing_mode: "per_inch", status: "completed", snow_reviewed_at: "2026-10-30T02:00:00Z" })).toBe(false));
  it("does not count per-inch rates as fixed yearly revenue", () => expect(customerYearTotals([{ service: "Snow", price: 20, frequency: "weekly", active: true, pricing_mode: "per_inch" }], [], []).yearlyServices).toBe(0));
  it("persists per-inch service pricing", () => expect(servicePayload({ ...categoryServiceForm("snow_plowing"), price: "20", pricing_mode: "per_inch" })).toMatchObject({ pricing_mode: "per_inch", price: 20 }));
  it("charges a flat per-storm fee regardless of time", () => expect(snowCharge("flat", 125, 2.5)).toBe(125));
  it("bills only crew time when the minimum is blank", () => expect(snowCharge("hourly", 80, 0.5, null)).toBe(40));
  it("applies a one-hour minimum", () => expect(snowCharge("hourly", 80, 0.5, 1)).toBe(80));
  it("supports larger minimums", () => expect(snowCharge("hourly", 80, 0.5, 2)).toBe(160));
  it("bills actual time above the minimum", () => expect(snowCharge("hourly", 80, 2.25, 1)).toBe(180));
  it("rounds the final charge to cents", () => expect(snowCharge("hourly", 75, 0.333)).toBe(24.98));
  it("does not treat an hourly rate as guaranteed yearly revenue", () => expect(customerYearTotals([{ service: "Snow", price: 80, frequency: "weekly", active: true, pricing_mode: "hourly" }], [], []).yearlyServices).toBe(0));
  it("rejects invalid crew time", () => expect(() => snowCharge("hourly", 80, -1)).toThrow());
  it("persists a blank minimum as null", () => expect(servicePayload({ ...categoryServiceForm("snow_plowing"), price: "80", pricing_mode: "hourly", minimum_hours: "" })).toMatchObject({ pricing_mode: "hourly", price: 80, minimum_hours: null }));
});