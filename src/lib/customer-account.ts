export type BillingInvoice = { status: string; due_date: string; total: number; amount_paid: number };

export function customerAccountState(status: string, reason: string | null, limit: number | null, invoices: BillingInvoice[], today: string) {
  const overdue = invoices.filter(i => !["draft", "void"].includes(i.status) && i.due_date < today).reduce((sum, i) => sum + Math.max(i.total - i.amount_paid, 0), 0);
  if (status !== "active") return { status: "inactive", reason: reason || "Inactive", overdue };
  if (overdue > (limit ?? 0)) return { status: "on_hold", reason: "Billing: overdue invoices", overdue };
  return { status: "active", reason: null, overdue };
}