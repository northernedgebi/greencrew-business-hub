import { describe, expect, it } from "vitest";
import { canRemoveVisit } from "@/lib/service-retention";
describe("retain customer work and balances", () => {
  it("keeps completed work even before billing", () => expect(canRemoveVisit("completed", null)).toBe(false));
  it("keeps billed visits", () => expect(canRemoveVisit("scheduled", "invoice")).toBe(false));
  it("allows removing unbilled future services", () => expect(canRemoveVisit("scheduled", null)).toBe(true));
});