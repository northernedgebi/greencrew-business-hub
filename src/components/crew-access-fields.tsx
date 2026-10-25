import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CrewAccess } from "@/lib/crew-access";

export function CrewAccessFields({ value, onChange, crews, prefix }: { value: CrewAccess; onChange: (value: CrewAccess) => void; crews: { id: string; name: string }[]; prefix: string }) {
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="space-y-1.5"><Label htmlFor={`${prefix}-crew`}>Assigned crew</Label><select id={`${prefix}-crew`} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.crew_id ?? ""} onChange={(e) => onChange({ ...value, crew_id: e.target.value || null })}><option value="">No crew / access paused</option>{crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <div className="space-y-1.5"><Label htmlFor={`${prefix}-from`}>Visible from</Label><Input id={`${prefix}-from`} className="h-11" type="date" required={!!value.crew_id} max={value.schedule_visible_until ?? undefined} value={value.schedule_visible_from ?? ""} onChange={(e) => onChange({ ...value, schedule_visible_from: e.target.value || null })} /></div>
    <div className="space-y-1.5"><Label htmlFor={`${prefix}-until`}>Visible through</Label><Input id={`${prefix}-until`} className="h-11" type="date" required={!!value.crew_id} min={value.schedule_visible_from ?? undefined} value={value.schedule_visible_until ?? ""} onChange={(e) => onChange({ ...value, schedule_visible_until: e.target.value || null })} /></div>
  </div>;
}