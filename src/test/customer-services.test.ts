import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE, FREQUENCIES, monthlyServiceValue, nearbyServices, newServiceForm, servicePayload, summarizeCustomerServices, type NearbyJob } from "@/lib/customer-services";

const job = (id: string, kind: string, date: string, overrides: Partial<NearbyJob> = {}): NearbyJob => ({ id, title: id, service_kind: kind, scheduled_date: date, status: "scheduled", customer_id: "customer", property_id: "property", crew_id: "crew", ...overrides });
describe("customer services", () => {
  it("sends the local calendar timezone and the valid $100 price when adding a yearly service", () => {
    expect(servicePayload({ ...newServiceForm(), title: "Sprinkler Blowout", frequency: "yearly", date: "2026-10-25", price: "100" }, "America/New_York")).toMatchObject({ date: "2026-10-25", price: 100, timezone: "America/New_York", frequency: "yearly" });
  });
  it("defaults the initial service to lawn maintenance", () => expect(DEFAULT_SERVICE).toBe("Lawn maintenance"));
  it("supports yearly services", () => expect(FREQUENCIES.map(f => f.value)).toContain("yearly"));
  it("spreads yearly charges across twelve months", () => expect(monthlyServiceValue(120, "yearly")).toBe(10));
  it("offers a custom times-per-year option", () => expect(FREQUENCIES.map(f => f.value)).toContain("custom"));
  it("sends how many times a year for custom services", () => expect(servicePayload({ ...newServiceForm(), frequency: "custom", times_per_year: "6", title: "Fertilizing", date: "2026-10-25", price: "80" })).toMatchObject({ frequency: "custom", times_per_year: 6 }));
  it("sends no times-per-year for standard frequencies", () => expect(servicePayload({ ...newServiceForm() })).toMatchObject({ times_per_year: null }));
  it("values a 6-times-a-year service at six twelfths of its yearly run rate", () => expect(monthlyServiceValue(120, "custom", 6)).toBe(60));
  it("supports one-time services", () => expect(FREQUENCIES.map(f => f.value)).toContain("once"));
  it("flags weeding near a lawn cut", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("weeding", "other", "2026-10-28")], "2026-10-26").map(p => [p.service.id, p.lawn.id])).toEqual([["weeding", "cut"]]));
  it("does not flag different properties or customers", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("other-property", "other", "2026-10-28", { property_id: "elsewhere" }), job("other-customer", "other", "2026-10-28", { customer_id: "elsewhere" })], "2026-10-26")).toEqual([]));
  it("only flags separate dates within three days", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("same-day", "other", "2026-10-30"), job("far", "other", "2026-11-03")], "2026-10-26")).toEqual([]));
  it("does not move completed or cancelled work", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("done", "other", "2026-10-28", { status: "completed" }), job("cancelled", "other", "2026-10-29", { status: "cancelled" })], "2026-10-26")).toEqual([]));
});