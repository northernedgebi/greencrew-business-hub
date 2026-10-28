import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE, FREQUENCIES, SERVICE_CATEGORIES, availableCrewVisits, categoryServiceForm, isWinterService, serviceKindFromTitle, customerYearTotals, monthlyServiceValue, nearbyServices, newServiceForm, seasonLabel, servicePayload, summarizeCustomerServices, type NearbyJob } from "@/lib/customer-services";

const job = (id: string, kind: string, date: string, overrides: Partial<NearbyJob> = {}): NearbyJob => ({ id, title: id, service_kind: kind, scheduled_date: date, status: "scheduled", customer_id: "customer", property_id: "property", crew_id: "crew", ...overrides });
describe("winter and shared crew work", () => {
  it("supports snow plowing, snow removal and shoveling alongside lawn care", () => {
    expect(SERVICE_CATEGORIES.map(c => c.value)).toEqual(["lawn", "snow_plowing", "snow_removal", "shoveling", "other"]);
    expect(isWinterService("snow_plowing")).toBe(true);
    expect(isWinterService("lawn")).toBe(false);
  });
  it("keeps separate charges and dates for lawn and winter work", () => {
    const lawn = servicePayload({ ...newServiceForm(), price: "75", date: "2026-10-27" });
    const snow = servicePayload({ ...categoryServiceForm("snow_plowing"), price: "125", date: "2026-12-01", notes: "Driveway and garage apron" });
    expect(lawn.price).toBe(75);
    expect(snow).toMatchObject({ price: 125, date: "2026-12-01", kind: "snow_plowing", notes: "Driveway and garage apron" });
  });
  it("offers only active upcoming crew visits for the same customer and address", () => {
    expect(availableCrewVisits([job("target", "lawn", "2026-10-27"), job("other-address", "lawn", "2026-10-27", { property_id: "elsewhere" }), job("other-customer", "lawn", "2026-10-27", { customer_id: "elsewhere" }), job("unassigned", "lawn", "2026-10-27", { crew_id: null }), job("done", "lawn", "2026-10-27", { status: "completed" }), job("past", "lawn", "2026-10-26"), job("self", "other", "2026-10-28")], "customer", "property", "2026-10-27", "self").map(v => v.id)).toEqual(["target"]);
  });
  it("recognizes winter jobs entered from the schedule", () => {
    expect(serviceKindFromTitle("Snow plowing")).toBe("snow_plowing");
    expect(serviceKindFromTitle("Snow removal")).toBe("snow_removal");
    expect(serviceKindFromTitle("Shoveling sidewalks")).toBe("shoveling");
  });
});
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
describe("customerYearTotals", () => {
  it("sums active recurring services to a yearly value plus this year's one-time work", () => {
    const totals = customerYearTotals(
      [
        { service: "Lawn maintenance", price: 50, frequency: "weekly", active: true },
        { service: "Fertilizing", price: 100, frequency: "custom", times_per_year: 6, active: true },
        { service: "Blowout", price: 120, frequency: "yearly", active: true },
        { service: "Old plan", price: 999, frequency: "monthly", active: false },
      ],
      [{ price: 80 }, { price: 20 }],
      [{ amount: 500 }, { amount: 250 }],
    );
    // 50*4.33*12 + 100*6 + 120 + 100 = 2598 + 600 + 120 + 100 = 3418
    expect(totals.yearlyServices).toBeCloseTo(3418, 2);
    expect(totals.paidThisYear).toBe(750);
    expect(totals.leftForYear).toBeCloseTo(2668, 2);
  });

  it("never shows a negative amount left for the year", () => {
    const totals = customerYearTotals(
      [{ service: "Lawn maintenance", price: 10, frequency: "monthly", active: true }],
      [],
      [{ amount: 500 }],
    );
    expect(totals.yearlyServices).toBe(120);
    expect(totals.leftForYear).toBe(0);
  });
});

describe("service season windows", () => {
  it("sends season dates as month-day only for repeating services", () => {
    const payload = servicePayload({ ...newServiceForm(), frequency: "weekly", season_start: "2026-05-01", season_end: "2026-10-31" }, "UTC");
    expect(payload.season_start).toBe("05-01");
    expect(payload.season_end).toBe("10-31");
  });

  it("omits the season for one-time services and blank fields", () => {
    expect(servicePayload({ ...newServiceForm(), frequency: "once", season_start: "2026-05-01", season_end: "2026-10-31" }, "UTC").season_start).toBeNull();
    expect(servicePayload({ ...newServiceForm(), frequency: "weekly" }, "UTC").season_start).toBeNull();
  });

  it("labels the season for display", () => {
    expect(seasonLabel("05-01", "10-31")).toBe("May 1 – Oct 31");
    expect(seasonLabel(null, null)).toBeNull();
  });
});

describe("as-needed winter services", () => {
  it("defaults snow services to as needed instead of a fixed count", () => expect(categoryServiceForm("snow_plowing").frequency).toBe("as_needed"));
  it("does not count as-needed services toward a fixed monthly value", () => expect(monthlyServiceValue(100, "as_needed")).toBe(0));
});
