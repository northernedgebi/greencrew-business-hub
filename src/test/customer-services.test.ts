import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE, FREQUENCIES, monthlyServiceValue, nearbyServices, type NearbyJob } from "@/lib/customer-services";

const job = (id: string, kind: string, date: string, overrides: Partial<NearbyJob> = {}): NearbyJob => ({ id, title: id, service_kind: kind, scheduled_date: date, status: "scheduled", customer_id: "customer", property_id: "property", crew_id: "crew", ...overrides });
describe("customer services", () => {
  it("defaults the initial service to lawn maintenance", () => expect(DEFAULT_SERVICE).toBe("Lawn maintenance"));
  it("supports yearly services", () => expect(FREQUENCIES.map(f => f.value)).toContain("yearly"));
  it("spreads yearly charges across twelve months", () => expect(monthlyServiceValue(120, "yearly")).toBe(10));
  it("supports one-time services", () => expect(FREQUENCIES.map(f => f.value)).toContain("once"));
  it("flags weeding near a lawn cut", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("weeding", "other", "2026-10-28")], "2026-10-26").map(p => [p.service.id, p.lawn.id])).toEqual([["weeding", "cut"]]));
  it("does not flag different properties or customers", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("other-property", "other", "2026-10-28", { property_id: "elsewhere" }), job("other-customer", "other", "2026-10-28", { customer_id: "elsewhere" })], "2026-10-26")).toEqual([]));
  it("only flags separate dates within three days", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("same-day", "other", "2026-10-30"), job("far", "other", "2026-11-03")], "2026-10-26")).toEqual([]));
  it("does not move completed or cancelled work", () => expect(nearbyServices([job("cut", "lawn", "2026-10-30"), job("done", "other", "2026-10-28", { status: "completed" }), job("cancelled", "other", "2026-10-29", { status: "cancelled" })], "2026-10-26")).toEqual([]));
});