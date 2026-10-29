import { format, lastDayOfMonth, parseISO } from "date-fns";

export function monthlyBillingDate(first: string, month: string) {
  const start = parseISO(`${month.slice(0, 7)}-01`);
  start.setDate(Math.min(parseISO(first).getDate(), lastDayOfMonth(start).getDate()));
  return format(start, "yyyy-MM-dd");
}

export function validateMonthlyBilling(frequency: string, start: string, end: string, amount: string, mode: string) {
  if (frequency === "monthly" && !start) throw new Error("Choose the first billing date");
  if (end && start && end < start) throw new Error("Billing end must be on or after the first bill");
  if (amount && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) throw new Error("Monthly amount must be greater than zero");
  if (amount && mode !== "combined") throw new Error("Use one combined bill for a fixed monthly amount");
}