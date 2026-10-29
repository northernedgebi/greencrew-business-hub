import { describe, expect, it } from "vitest";
import { monthlyBillingDate, validateMonthlyBilling } from "@/lib/monthly-billing";

describe("monthly customer billing", () => {
  it("bills on the first when the first is chosen", () => expect(monthlyBillingDate("2026-11-01", "2026-12")).toBe("2026-12-01"));
  it("preserves a chosen monthly date", () => expect(monthlyBillingDate("2026-11-15", "2027-01")).toBe("2027-01-15"));
  it("clamps short months without losing the original day", () => {
    expect(monthlyBillingDate("2026-01-31", "2026-02")).toBe("2026-02-28");
    expect(monthlyBillingDate("2026-01-31", "2026-03")).toBe("2026-03-31");
  });
  it("allows a fixed positive monthly service fee", () => expect(() => validateMonthlyBilling("monthly", "2026-11-01", "", "500", "combined")).not.toThrow());
  it("rejects a zero monthly fee", () => expect(() => validateMonthlyBilling("monthly", "2026-11-01", "", "0", "combined")).toThrow());
  it("requires a billing start date", () => expect(() => validateMonthlyBilling("monthly", "", "", "", "combined")).toThrow());
  it("does not duplicate a fixed customer fee across addresses", () => expect(() => validateMonthlyBilling("monthly", "2026-11-01", "", "500", "per_property")).toThrow());
  it("rejects a reversed billing window", () => expect(() => validateMonthlyBilling("monthly", "2026-11-01", "2026-10-01", "", "combined")).toThrow());
});