import { describe, expect, it } from "vitest";
import { optimizeRoute } from "@/lib/route-optimizer";

describe("optimizeRoute", () => {
  it("visits stops along a line in order from the crew start", () => {
    const start = { lat: 40, lng: -75 };
    const stops = [
      { id: "far", lat: 40, lng: -74.7 },
      { id: "near", lat: 40, lng: -74.9 },
      { id: "mid", lat: 40, lng: -74.8 },
    ];
    expect(optimizeRoute(start, stops)).toEqual(["near", "mid", "far"]);
  });

  it("puts stops without a location last", () => {
    const order = optimizeRoute(null, [
      { id: "x", lat: null, lng: null },
      { id: "a", lat: 40, lng: -75 },
      { id: "b", lat: 40, lng: -74.9 },
    ]);
    expect(order[2]).toBe("x");
  });
});
