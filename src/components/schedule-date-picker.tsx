import { useState } from "react";
import { format, getDay, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateOnWeekday, localDate, WEEKDAYS } from "@/lib/scheduling";

export function ScheduleDatePicker({ value, onChange, label = "Date", min, max }: { value: string; onChange: (value: string) => void; label?: string; min?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const allowed = (date: string) => (!min || date >= min) && (!max || date <= max);
  return <div className="space-y-2">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" variant="outline" aria-label={label} className="h-11 w-full justify-start font-normal"><CalendarIcon />{format(selected, "EEE, MMM d, yyyy")}</Button></PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <Calendar mode="single" selected={selected} defaultMonth={selected} disabled={(date) => !allowed(localDate(date))} onSelect={(date) => { if (date && allowed(localDate(date))) { onChange(localDate(date)); setOpen(false); } }} className="pointer-events-auto" />
      </PopoverContent>
    </Popover>
    <select aria-label={`${label} weekday`} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={getDay(selected)} onChange={(e) => onChange(dateOnWeekday(value, Number(e.target.value)))}>
      {WEEKDAYS.map((day, i) => <option key={day} value={i} disabled={!allowed(dateOnWeekday(value, i))}>{day}</option>)}
    </select>
  </div>;
}