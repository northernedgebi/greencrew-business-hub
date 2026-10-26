import { differenceInCalendarDays, parseISO } from "date-fns";
import { localDate } from "@/lib/scheduling";

export const DEFAULT_SERVICE = "Lawn maintenance";
export const NEARBY_DAYS = 3;
export type ServiceFrequency = "once" | "weekly" | "biweekly" | "monthly" | "yearly";
export type ServiceForm = { title: string; kind: string; frequency: ServiceFrequency; date: string; price: string; crew_id: string; notes: string };
export const newServiceForm = (): ServiceForm => ({ title: DEFAULT_SERVICE, kind: "lawn", frequency: "weekly", date: localDate(new Date()), price: "", crew_id: "", notes: "" });
export const FREQUENCIES: { value: ServiceFrequency; label: string }[] = [{ value: "once", label: "One time" }, { value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Every 2 weeks" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }];
export function servicePayload(service: ServiceForm, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return { ...service, price: Number(service.price), timezone: timeZone };
}
export function monthlyServiceValue(price: number, frequency: Exclude<ServiceFrequency, "once">) {
  return price * (frequency === "weekly" ? 4.33 : frequency === "biweekly" ? 2.17 : frequency === "yearly" ? 1 / 12 : 1);
}
export type NearbyJob = { id: string; title: string; customer_id: string; property_id: string | null; crew_id: string | null; scheduled_date: string; status: string; service_kind: string; customer?: { name: string } | null; crew?: { name: string } | null };
export function nearbyServices(jobs: NearbyJob[], today: string) {
  const upcoming = jobs.filter(j => j.status === "scheduled" && j.scheduled_date >= today);
  return upcoming.filter(j => j.service_kind !== "lawn" && j.property_id).flatMap(service => {
    const lawn = upcoming.filter(j => j.service_kind === "lawn" && j.customer_id === service.customer_id && j.property_id === service.property_id && Math.abs(differenceInCalendarDays(parseISO(j.scheduled_date), parseISO(service.scheduled_date))) >= 1 && Math.abs(differenceInCalendarDays(parseISO(j.scheduled_date), parseISO(service.scheduled_date))) <= NEARBY_DAYS)
      .sort((a,b) => Math.abs(differenceInCalendarDays(parseISO(a.scheduled_date), parseISO(service.scheduled_date))) - Math.abs(differenceInCalendarDays(parseISO(b.scheduled_date), parseISO(service.scheduled_date))) || a.scheduled_date.localeCompare(b.scheduled_date))[0];
    return lawn ? [{ service, lawn }] : [];
  });
}

export type ServicePlanForSummary = { service: string; price: number; frequency: ServiceFrequency; active: boolean };
export type ServiceSummaryRow = { name: string; frequency: ServiceFrequency; prices: number[]; count: number };

export function summarizeCustomerServices(plans: ServicePlanForSummary[], oneTime: { title: string; price: number }[] = []): ServiceSummaryRow[] {
  const rows = new Map<string, ServiceSummaryRow>();
  const add = (name: string, frequency: ServiceFrequency, price: number) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    const row = rows.get(key) ?? { name: name.trim(), frequency, prices: [], count: 0 };
    row.prices.push(price);
    row.count += 1;
    if (frequency !== "once") row.frequency = frequency;
    rows.set(key, row);
  };
  for (const p of plans) add(p.service, p.frequency, Number(p.price));
  for (const v of oneTime) add(v.title, "once", Number(v.price));
  return [...rows.values()];
}

export function customerMonthlyValue(plans: ServicePlanForSummary[]) {
  return plans.reduce((sum, p) => sum + (p.frequency === "once" ? 0 : monthlyServiceValue(Number(p.price), p.frequency)), 0);
}