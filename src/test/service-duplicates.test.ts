import { describe, expect, it } from "vitest";
import { findDuplicateService } from "@/lib/service-duplicates";
const plan = { id: "plan", property_id: "home", service: "Sprinkler blowout" };
const visit = { id: "visit", property_id: "home", title: "Weeding", recurring_plan_id: null };
describe("duplicate customer services", () => {
  it("blocks an existing sprinkler blowout regardless of case and whitespace", () => expect(findDuplicateService([plan], [], " SPRINKLER   blowout ", "home")).toEqual({ type: "plan", id: "plan" }));
  it("blocks an existing standalone service", () => expect(findDuplicateService([], [visit], "Weeding", "home")).toEqual({ type: "visit", id: "visit" }));
  it("allows editing the existing service", () => expect(findDuplicateService([plan], [], plan.service, "home", "plan")).toBeNull());
  it("allows editing the existing one-time work", () => expect(findDuplicateService([], [visit], "Weeding", "home", null, "visit")).toBeNull());
  it("allows the same service at a different address", () => expect(findDuplicateService([plan], [], plan.service, "office")).toBeNull());
  it("allows adding again after removal", () => expect(findDuplicateService([], [], plan.service, "home")).toBeNull());
  it("does not treat recurring occurrences as duplicate service definitions", () => expect(findDuplicateService([], [{ ...visit, recurring_plan_id: "plan" }], "Weeding", "home")).toBeNull());
});