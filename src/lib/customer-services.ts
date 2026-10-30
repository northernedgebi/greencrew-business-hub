import { differenceInCalendarDays, parseISO } from "date-fns";
import { localDate } from "@/lib/scheduling";

export const DEFAULT_SERVICE = "Lawn maintenance";
export const NEARBY_DAYS = 3;
export const SERVICE_CATEGORIES = [
  { value: "lawn", label: "Lawn maintenance" },
  { value: "sprinkler_blowout", label: "Sprinkler blowout" },
  { value: "bush_trimming", label: "Bush trimming" },
  { value: "fertilizers", label: "Fertilizers" },
  { value: "weeding", label: "Weeding" },
  { value: "fall_cleanup", label: "Fall cleanup" },
  { value: "spring_cleanup", label: "Spring cleanup" },
  { value: "snow_plowing", label: "Snow plowing" },
  { value: "snow_removal", label: "Snow removal" },
  { value: "shoveling", label: "Shoveling" },
  { value: "other", label: "Additional service" },
] as const;
export const isWinterService = (kind: string) => ["snow_plowing", "snow_removal", "shoveling"].includes(kind);
export const SPRING_PACKAGES = [
  { value: "basic", label: "Basic", includes: "Leaf and loose debris removal; lawn and walkway cleanup; debris haul-away." },
  { value: "medium", label: "Medium", includes: "Basic cleanup, plus garden bed cleanup, weeding, and bush trimming." },
  { value: "advanced", label: "Advanced", includes: "Medium cleanup, plus bed edging, mulch installation, and spring fertilizer application." },
] as const;
export function springPackageFromTitle(title: string) {
  return SPRING_PACKAGES.find(p => title.trim().toLowerCase() === `spring cleanup — ${p.label}`.toLowerCase());
}
export function selectSpringPackage(service: ServiceForm, tier: string): ServiceForm {
  const selected = SPRING_PACKAGES.find(p => p.value === tier);
  if (!selected) return service;
  return { ...service, kind: "spring_cleanup", title: `Spring cleanup — ${selected.label}`, notes: selected.includes };
}
export function serviceKindFromTitle(title: string) {
  if (/^spring cleanup(?:\s|$)/i.test(title.trim())) return "spring_cleanup";
  if (/shovel/i.test(title)) return "shoveling";
  if (/snow.*plow|plow/i.test(title)) return "snow_plowing";
  if (/snow/i.test(title)) return "snow_removal";
  return /mow|lawn|grass|cut/i.test(title) ? "lawn" : "other";
}
export function categoryServiceForm(kind: string): ServiceForm {
  const form: ServiceForm = { ...newServiceForm(), kind, title: SERVICE_CATEGORIES.find(c => c.value === kind)?.label ?? "", frequency: kind === "lawn" ? "weekly" : isWinterService(kind) ? "as_needed" : "once" };
  return kind === "spring_cleanup" ? selectSpringPackage(form, "basic") : form;
}
export type CrewVisit = { id: string; customer_id: string; property_id: string | null; crew_id: string | null; scheduled_date: string; status?: string };
export function availableCrewVisits<T extends CrewVisit>(visits: T[], customerId: string, propertyId: string, today: string, excludeId?: string) {
  return visits.filter(v => v.id !== excludeId && v.customer_id === customerId && v.property_id === propertyId && !!v.crew_id && v.scheduled_date >= today && (!v.status || v.status === "scheduled" || v.status === "in_progress"));
}
export type ServiceFrequency = "once" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom" | "as_needed";
export type ServiceForm = { title: string; kind: string; frequency: ServiceFrequency; date: string; price: string; times_per_year: string; crew_id: string; notes: string; season_start: string; season_end: string; pricing_mode?: "flat" | "hourly"; minimum_hours?: string };
export const newServiceForm = (): ServiceForm => ({ title: DEFAULT_SERVICE, kind: "lawn", frequency: "weekly", date: localDate(new Date()), price: "", times_per_year: "4", crew_id: "", notes: "", season_start: "", season_end: "" });
export function seasonLabel(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  const fmt = (md: string) => new Date(2000, Number(md.slice(0, 2)) - 1, Number(md.slice(3))).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}
export const FREQUENCIES: { value: ServiceFrequency; label: string }[] = [{ value: "once", label: "One time" }, { value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Every 2 weeks" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }, { value: "custom", label: "Custom (times per year)" }, { value: "as_needed", label: "As needed (each storm)" }];
export function servicePayload(service: ServiceForm, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const seasonal = service.frequency !== "once" && service.season_start && service.season_end;
  const kind = service.kind === "lawn" || isWinterService(service.kind) ? service.kind : "other";
  return { ...service, kind, pricing_mode: isWinterService(service.kind) ? service.pricing_mode ?? "flat" : "flat", minimum_hours: isWinterService(service.kind) && service.pricing_mode === "hourly" && service.minimum_hours ? Number(service.minimum_hours) : null, price: Number(service.price), timezone: timeZone, times_per_year: service.frequency === "custom" ? Number(service.times_per_year) : null, season_start: seasonal ? service.season_start.slice(5) : null, season_end: seasonal ? service.season_end.slice(5) : null };
}
export function monthlyServiceValue(price: number, frequency: Exclude<ServiceFrequency, "once">, timesPerYear?: number | null) {
  return price * (frequency === "weekly" ? 4.33 : frequency === "biweekly" ? 2.17 : frequency === "yearly" ? 1 / 12 : frequency === "custom" ? (timesPerYear ?? 0) / 12 : frequency === "as_needed" ? 0 : 1);
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

export type ServicePlanForSummary = { service: string; price: number; frequency: ServiceFrequency; times_per_year?: number | null; active: boolean; pricing_mode?: string };
export type ServiceSummaryRow = { name: string; frequency: ServiceFrequency; prices: number[]; count: number; pricing_mode?: string };

export function summarizeCustomerServices(plans: ServicePlanForSummary[], oneTime: { title: string; price: number }[] = []): ServiceSummaryRow[] {
  const rows = new Map<string, ServiceSummaryRow>();
  const add = (name: string, frequency: ServiceFrequency, price: number, pricing_mode = "flat") => {
    const key = `${name.trim().toLowerCase()}|${pricing_mode}`;
    if (!key) return;
    const row = rows.get(key) ?? { name: name.trim(), frequency, prices: [], count: 0, pricing_mode };
    row.prices.push(price);
    row.count += 1;
    if (frequency !== "once") row.frequency = frequency;
    rows.set(key, row);
  };
  for (const p of plans) add(p.service, p.frequency, Number(p.price), p.pricing_mode);
  for (const v of oneTime) add(v.title, "once", Number(v.price));
  return [...rows.values()];
}

export function customerMonthlyValue(plans: ServicePlanForSummary[]) {
  return plans.reduce((sum, p) => sum + (p.pricing_mode === "hourly" || p.frequency === "once" || p.frequency === "as_needed" ? 0 : monthlyServiceValue(Number(p.price), p.frequency, p.times_per_year)), 0);
}

export type YearTotals = { yearlyServices: number; paidThisYear: number; leftForYear: number };

export function customerYearTotals(plans: ServicePlanForSummary[], oneTimeThisYear: { price: number }[], paymentsThisYear: { amount: number }[]): YearTotals {
  const yearlyServices = plans.reduce((sum, p) => sum + (!p.active || p.pricing_mode === "hourly" || p.frequency === "once" || p.frequency === "as_needed" ? 0 : monthlyServiceValue(Number(p.price), p.frequency, p.times_per_year) * 12), 0)
    + oneTimeThisYear.reduce((sum, j) => sum + Number(j.price), 0);
  const paidThisYear = paymentsThisYear.reduce((sum, p) => sum + Number(p.amount), 0);
  return { yearlyServices, paidThisYear, leftForYear: Math.max(0, yearlyServices - paidThisYear) };
}