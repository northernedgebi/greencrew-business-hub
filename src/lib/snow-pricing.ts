export type SnowPricing = { pricing_mode: string; hourly_rate: number | null; minimum_hours: number | null; worked_hours: number | null; price: number };

export function snowCharge(mode: string, rate: number, hours: number | null, minimum: number | null = null) {
  if (!Number.isFinite(rate) || rate < 0 || (hours !== null && (!Number.isFinite(hours) || hours < 0)) || (minimum !== null && (!Number.isFinite(minimum) || minimum < 0))) throw new Error("Enter valid non-negative pricing and hours");
  return mode === "hourly" ? Math.round(rate * Math.max(hours ?? 0, minimum ?? 0) * 100) / 100 : rate;
}