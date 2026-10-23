import { describe, expect, it } from "vitest";
import { dateOnWeekday } from "@/lib/scheduling";

describe("weekday scheduling", () => {
  it("chooses the next requested weekday", () => {
    expect(dateOnWeekday("2026-10-23", 1)).toBe("2026-10-26");
  });
  it("keeps the date when it already matches the chosen weekday", () => {
    expect(dateOnWeekday("2026-10-23", 5)).toBe("2026-10-23");
  });
  it("moves across month boundaries", () => {
    expect(dateOnWeekday("2026-10-31", 1)).toBe("2026-11-02");
  });
});