import { describe, expect, it } from "vitest";
import { billGroups, billLineDescription, type BillableVisit } from "@/lib/billing";

const visit = (id: string, property_id: string | null, address: string | null): BillableVisit => ({ id, title: "Weekly mowing", scheduled_date: "2026-10-20", price: 75, property_id, address });

describe("billGroups", () => {
  it("combined mode puts every visit on one bill", () => {
    const groups = billGroups([visit("a", "p1", "1 Main St"), visit("b", "p2", "2 Oak Ave")], "combined");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.visits.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("per-property mode makes one bill per address", () => {
    const groups = billGroups([visit("a", "p1", "1 Main St"), visit("b", "p2", "2 Oak Ave"), visit("c", "p1", "1 Main St")], "per_property");
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.address === "1 Main St")?.visits.map((v) => v.id)).toEqual(["a", "c"]);
    expect(groups.find((g) => g.address === "2 Oak Ave")?.visits.map((v) => v.id)).toEqual(["b"]);
  });

  it("keeps visits without an address together in per-property mode", () => {
    const groups = billGroups([visit("a", null, null), visit("b", null, null)], "per_property");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.address).toBeNull();
  });

  it("returns no groups when nothing is billable", () => {
    expect(billGroups([], "combined")).toEqual([]);
  });
});

describe("billLineDescription", () => {
  it("names the address on combined bills so each line shows what is billed", () => {
    expect(billLineDescription(visit("a", "p1", "1 Main St"), "combined")).toBe("Weekly mowing (2026-10-20) — 1 Main St");
  });

  it("omits the address on per-address bills", () => {
    expect(billLineDescription(visit("a", "p1", "1 Main St"), "per_property")).toBe("Weekly mowing (2026-10-20)");
  });
});
