import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleDatePicker } from "@/components/schedule-date-picker";
import { FREQUENCIES, SERVICE_CATEGORIES, isWinterService, type ServiceForm } from "@/lib/customer-services";
import { localDate } from "@/lib/scheduling";

export function CustomerServiceFields({ value, onChange, crews, idPrefix = "service" }: { value: ServiceForm; onChange: (v: ServiceForm) => void; crews: { id: string; name: string }[]; idPrefix?: string }) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-title`}>Service name</Label><Input id={`${idPrefix}-title`} required value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Service category</Label><Select value={value.kind} onValueChange={kind => onChange({ ...value, kind, title: kind === "other" ? value.title : SERVICE_CATEGORIES.find(c => c.value === kind)?.label ?? value.title })}><SelectTrigger aria-label="Service category"><SelectValue /></SelectTrigger><SelectContent>{SERVICE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Repeat</Label><Select value={value.frequency} onValueChange={frequency => { const found = FREQUENCIES.find(f => f.value === frequency); if (found) onChange({ ...value, frequency: found.value }); }}><SelectTrigger aria-label="Repeat"><SelectValue /></SelectTrigger><SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent></Select></div>
      {value.frequency !== "as_needed" && <div className="space-y-1.5"><Label>First visit</Label><ScheduleDatePicker value={value.date} min={localDate(new Date())} onChange={date => onChange({ ...value, date })} label="Service date" /></div>}
      {isWinterService(value.kind) && <div className="space-y-1.5"><Label>Pricing</Label><Select value={value.pricing_mode ?? "flat"} onValueChange={mode => onChange({ ...value, pricing_mode: mode === "hourly" ? "hourly" : "flat" })}><SelectTrigger aria-label="Snow pricing"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flat">Flat fee per storm</SelectItem><SelectItem value="hourly">Hourly</SelectItem></SelectContent></Select></div>}
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-price`}>{isWinterService(value.kind) ? value.pricing_mode === "hourly" ? "Hourly rate ($)" : "Flat fee per storm ($)" : "Price per visit ($)"}</Label><Input id={`${idPrefix}-price`} type="number" min="0" step="0.01" required value={value.price} onChange={e => onChange({ ...value, price: e.target.value })} /></div>
      {isWinterService(value.kind) && value.pricing_mode === "hourly" && <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-minimum`}>Minimum hours (optional)</Label><Input id={`${idPrefix}-minimum`} type="number" min="0" step="0.01" placeholder="No minimum" value={value.minimum_hours ?? ""} onChange={e => onChange({ ...value, minimum_hours: e.target.value })} /></div>}
    </div>
    {value.frequency === "custom" && <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-times-per-year`}>Times per year</Label><Input id={`${idPrefix}-times-per-year`} type="number" min={2} max={51} step={1} required value={value.times_per_year} onChange={e => onChange({ ...value, times_per_year: e.target.value })} placeholder="e.g. 6" /></div>}
    {value.frequency === "as_needed" && <p className="text-sm text-muted-foreground">No visits are booked ahead. Add a visit each time it snows (Snow &amp; storm visits on the customer page), on the day you go.</p>}
    {value.frequency !== "once" && (
      <div className="space-y-1.5">
        <Label>Season (optional)</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="date" aria-label="Season start" value={value.season_start} onChange={e => onChange({ ...value, season_start: e.target.value })} />
          <Input type="date" aria-label="Season end" value={value.season_end} onChange={e => onChange({ ...value, season_end: e.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground">Only schedule this service between these months each year (e.g. May 1 – Oct 31). Leave blank for year-round.</p>
      </div>
    )}
    <div className="space-y-1.5"><Label>Crew</Label><Select value={value.crew_id || "none"} onValueChange={v => onChange({ ...value, crew_id: v === "none" ? "" : v })}><SelectTrigger aria-label="Service crew"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{crews.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-notes`}>Notes for crew</Label><Input id={`${idPrefix}-notes`} value={value.notes} onChange={e => onChange({ ...value, notes: e.target.value })} /></div>
  </div>;
}