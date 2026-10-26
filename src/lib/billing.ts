export type BillingMode = "combined" | "per_property";
export type BillableVisit = { id: string; title: string; scheduled_date: string; price: number; property_id: string | null; address: string | null };
export type BillGroup = { key: string; address: string | null; visits: BillableVisit[] };

/** Group a customer's unbilled completed visits into invoices: one combined group, or one per service address. */
export function billGroups(visits: BillableVisit[], mode: BillingMode): BillGroup[] {
  if (visits.length === 0) return [];
  if (mode === "combined") return [{ key: "all", address: null, visits }];
  const map = new Map<string, BillGroup>();
  for (const v of visits) {
    const key = v.property_id ?? "no-address";
    const g = map.get(key) ?? { key, address: v.address, visits: [] };
    g.visits.push(v);
    map.set(key, g);
  }
  return [...map.values()];
}

export function billLineDescription(v: BillableVisit, mode: BillingMode) {
  const base = `${v.title} (${v.scheduled_date})`;
  return mode === "combined" && v.address ? `${base} — ${v.address}` : base;
}
