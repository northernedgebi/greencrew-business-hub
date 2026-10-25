import { PLANS } from "@/components/marketing";

export const planPrice = (plan: string) => PLANS.find((p) => p.id === plan)?.price ?? 0;

type Co = { plan: string; subscription_status: string; created_at: string; trial_ends_at: string; users?: number; customers?: number };

/** Platform KPIs. Only "active" companies count toward MRR; trials count as pipeline. */
export function platformStats(companies: Co[], now = new Date()) {
  const byStatus: Record<string, number> = {};
  const activeByPlan: Record<string, number> = {};
  let mrr = 0, trialMrr = 0, newThisMonth = 0, newLast30 = 0, trialsEndingSoon = 0, users = 0, customers = 0;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const signups = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString(undefined, { month: "short" }), count: 0 }; });
  for (const c of companies) {
    byStatus[c.subscription_status] = (byStatus[c.subscription_status] ?? 0) + 1;
    if (c.subscription_status === "active") { mrr += planPrice(c.plan); activeByPlan[c.plan] = (activeByPlan[c.plan] ?? 0) + 1; }
    if (c.subscription_status === "trialing") {
      trialMrr += planPrice(c.plan);
      const left = new Date(c.trial_ends_at).getTime() - now.getTime();
      if (left <= 7 * 86400000) trialsEndingSoon++;
    }
    const created = new Date(c.created_at);
    if (created >= monthStart) newThisMonth++;
    if (now.getTime() - created.getTime() <= 30 * 86400000) newLast30++;
    const s = signups.find((x) => x.y === created.getFullYear() && x.m === created.getMonth());
    if (s) s.count++;
    users += c.users ?? 0; customers += c.customers ?? 0;
  }
  return { total: companies.length, byStatus, activeByPlan, mrr, trialMrr, newThisMonth, newLast30, trialsEndingSoon, users, customers, signups: signups.map(({ label, count }) => ({ label, count })) };
}
