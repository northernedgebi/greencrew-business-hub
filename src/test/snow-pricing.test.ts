import { describe, expect, it } from "vitest";
import { snowCharge } from "@/lib/snow-pricing";
import { categoryServiceForm, servicePayload, customerYearTotals } from "@/lib/customer-services";

describe("snow pricing", () => {
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