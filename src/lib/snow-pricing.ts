export type SnowPricing = { pricing_mode: string; hourly_rate: number | null; minimum_hours: number | null; worked_hours: number | null; price: number; per_inch_rate?: number | null; snow_inches?: number | null; snow_reviewed_at?: string | null };

export const needsSnowReview = (job: { pricing_mode: string; status: string; snow_reviewed_at?: string | null }) => job.pricing_mode === "per_inch" && job.status === "completed" && !job.snow_reviewed_at;

export function snowCharge(mode: string, rate: number, hours: number | null, minimum: number | null = null) {
  if (!Number.isFinite(rate) || rate < 0 || (hours !== null && (!Number.isFinite(hours) || hours < 0)) || (minimum !== null && (!Number.isFinite(minimum) || minimum < 0))) throw new Error("Enter valid non-negative pricing and hours");
  return mode === "per_inch" ? Math.round(rate * (hours ?? 0) * 100) / 100 : mode === "hourly" ? Math.round(rate * Math.max(hours ?? 0, minimum ?? 0) * 100) / 100 : rate;
}