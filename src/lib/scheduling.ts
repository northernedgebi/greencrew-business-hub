import { addDays, format, getDay, parseISO } from "date-fns";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const localDate = (date: Date) => format(date, "yyyy-MM-dd");
export function dateOnWeekday(date: string, weekday: number): string {
  const parsed = parseISO(date);
  return localDate(addDays(parsed, (weekday - getDay(parsed) + 7) % 7));
}