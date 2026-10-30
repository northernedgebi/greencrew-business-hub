import { describe, expect, it } from "vitest";
import { categoryServiceForm, selectSpringPackage, servicePayload, springPackageFromTitle, serviceKindFromTitle, SPRING_PACKAGES } from "../lib/customer-services";

describe("spring cleanup packages", () => {
  it("offers exactly basic, medium and advanced", () => {
    expect(SPRING_PACKAGES.map(p => p.value)).toEqual(["basic", "medium", "advanced"]);
  });
  it("preserves the customer's price, date and crew when changing packages", () => {
    const form = { ...categoryServiceForm("spring_cleanup"), price: "150", date: "2027-04-15", crew_id: "crew-1" };
    for (const tier of ["basic", "medium", "advanced"]) {
      const selected = selectSpringPackage(form, tier);
      expect(springPackageFromTitle(selected.title)?.value).toBe(tier);
      expect(selected.price).toBe("150");
      expect(selected.date).toBe("2027-04-15");
      expect(selected.crew_id).toBe("crew-1");
    }
  });
  it("persists editable included work with the existing service record", () => {
    const form = { ...selectSpringPackage(categoryServiceForm("spring_cleanup"), "advanced"), notes: "Customer-specific scope", price: "325" };
    const payload = servicePayload(form, "America/New_York");
    expect(payload.notes).toBe("Customer-specific scope");
    expect(payload.price).toBe(325);
    expect(payload.kind).toBe("other");
    expect(serviceKindFromTitle(payload.title)).toBe("spring_cleanup");
    expect(springPackageFromTitle(payload.title)?.value).toBe("advanced");
  });
});