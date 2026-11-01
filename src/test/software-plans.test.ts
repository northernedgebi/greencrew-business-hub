import { describe, expect, it } from "vitest";
import { companyStatusFromSubscription, planFromPriceId } from "@/lib/software-plans";

describe("software plans", () => {
  it("maps checkout prices to company plans", () => {
    expect(planFromPriceId("growth_monthly")).toBe("growth");
    expect(planFromPriceId("unknown")).toBeNull();
  });
  it("failed renewals mark the company past due, cancellations canceled", () => {
    expect(companyStatusFromSubscription("unpaid")).toBe("past_due");
    expect(companyStatusFromSubscription("canceled")).toBe("canceled");
    expect(companyStatusFromSubscription("active")).toBe("active");
  });
});
