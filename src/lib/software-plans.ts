// Maps checkout price IDs (stable across test and live) to company plan IDs.
export const PLAN_PRICE_IDS = { starter: "starter_monthly", growth: "growth_monthly", pro: "pro_monthly" } as const;
export type SoftwarePlan = keyof typeof PLAN_PRICE_IDS;

export function planFromPriceId(priceId: string | null | undefined): SoftwarePlan | null {
  const hit = (Object.entries(PLAN_PRICE_IDS) as [SoftwarePlan, string][]).find(([, p]) => p === priceId);
  return hit ? hit[0] : null;
}

/** Company subscription_status derived from the payment subscription status. */
export function companyStatusFromSubscription(status: string): "active" | "past_due" | "canceled" | "trialing" {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "canceled";
}
