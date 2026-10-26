import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleDatePicker } from "@/components/schedule-date-picker";
import { FREQUENCIES, type ServiceForm } from "@/lib/customer-services";
import { localDate } from "@/lib/scheduling";

export function CustomerServiceFields({ value, onChange, crews }: { value: ServiceForm; onChange: (v: ServiceForm) => void; crews: { id: string; name: string }[] }) {
  return <div className="space-y-3">
    <div className="space-y-1.5"><Label htmlFor="service-title">Service name</Label><Input id="service-title" required value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Service category</Label><Select value={value.kind} onValueChange={kind => onChange({ ...value, kind })}><SelectTrigger aria-label="Service category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lawn">Lawn maintenance</SelectItem><SelectItem value="other">Additional service</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Repeat</Label><Select value={value.frequency} onValueChange={frequency => { const found = FREQUENCIES.find(f => f.value === frequency); if (found) onChange({ ...value, frequency: found.value }); }}><SelectTrigger aria-label="Repeat"><SelectValue /></SelectTrigger><SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>First visit</Label><ScheduleDatePicker value={value.date} min={localDate(new Date())} onChange={date => onChange({ ...value, date })} label="Service date" /></div>
      <div className="space-y-1.5"><Label htmlFor="service-price">Price per visit ($)</Label><Input id="service-price" type="number" min="0" step="0.01" required value={value.price} onChange={e => onChange({ ...value, price: e.target.value })} /></div>
    </div>
    {value.frequency === "custom" && <div className="space-y-1.5"><Label htmlFor="service-times-per-year">Times per year</Label><Input id="service-times-per-year" type="number" min={2} max={51} step={1} required value={value.times_per_year} onChange={e => onChange({ ...value, times_per_year: e.target.value })} placeholder="e.g. 6" /></div>}
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
    <div className="space-y-1.5"><Label htmlFor="service-notes">Notes for crew</Label><Input id="service-notes" value={value.notes} onChange={e => onChange({ ...value, notes: e.target.value })} /></div>
  </div>;
}