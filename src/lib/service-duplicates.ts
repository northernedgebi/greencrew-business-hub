export const normalizedServiceName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
type Plan = { id: string; property_id: string; service: string };
type Visit = { id: string; property_id: string | null; title: string; recurring_plan_id: string | null };
export function findDuplicateService(plans: Plan[], visits: Visit[], title: string, propertyId: string, excludePlan?: string | null, excludeVisit?: string | null) {
  const name = normalizedServiceName(title);
  if (!name || !propertyId) return null;
  const plan = plans.find(p => p.id !== excludePlan && p.property_id === propertyId && normalizedServiceName(p.service) === name);
  if (plan) return { type: "plan" as const, id: plan.id };
  const visit = visits.find(v => v.id !== excludeVisit && !v.recurring_plan_id && v.property_id === propertyId && normalizedServiceName(v.title) === name);
  return visit ? { type: "visit" as const, id: visit.id } : null;
}