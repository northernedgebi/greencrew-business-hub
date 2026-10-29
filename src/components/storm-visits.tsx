import { SnowTimeEntry } from "@/components/snow-time-entry";
import { snowCharge } from "@/lib/snow-pricing";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudSnow } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { localDate } from "@/lib/scheduling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteRecord } from "@/components/delete-record";

const METHODS = [{ v: "plow", l: "Plowed", kind: "snow_plowing" }, { v: "shovel", l: "Shoveled", kind: "shoveling" }, { v: "snowblower", l: "Snowblower", kind: "snow_removal" }, { v: "salt", l: "Salted", kind: "snow_removal" }] as const;
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";

/** Logs each storm visit as completed work (date, inches, trips, method, price) so it bills like any other visit. */
export function StormVisits({ customerId, properties }: { customerId: string; properties: { id: string; address: string }[] }) {
  const { companyId, role } = useWorkspace();
  const manage = can(role, "customers.manage");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const blank = () => ({ property_id: properties[0]?.id ?? "", date: localDate(new Date()), method: "plow", inches: "", trips: "1", price: "", notes: "", pricing_mode: "flat", minimum_hours: "", hours: "", plan_id: "", crew_id: "", status: "completed" });
  const [f, setF] = useState(blank);
  const q = useQuery({ queryKey: ["storm-visits", companyId, customerId], queryFn: async () => {
    const { data, error } = await supabase.from("jobs").select("id,title,scheduled_date,status,price,pricing_mode,hourly_rate,minimum_hours,worked_hours,snow_inches,snow_trips,snow_method,invoice_id,notes,property:properties(address)").eq("company_id", companyId).eq("customer_id", customerId).not("snow_method", "is", null).order("scheduled_date", { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  const plans = useQuery({ queryKey: ["storm-service-pricing", companyId, customerId], queryFn: async () => {
    const { data, error } = await supabase.from("recurring_plans").select("id,service,service_kind,property_id,crew_id,price,pricing_mode,minimum_hours").eq("company_id", companyId).eq("customer_id", customerId).eq("active", true).in("service_kind", ["snow_plowing", "snow_removal", "shoveling"]);
    if (error) throw error; return data ?? [];
  }});
  const crews = useQuery({ queryKey: ["crews", companyId], queryFn: async () => { const { data, error } = await supabase.from("crews").select("id,name").eq("company_id", companyId); if (error) throw error; return data ?? []; }});
  const save = useMutation({ mutationFn: async () => {
    if (!f.property_id) throw new Error("Add a service address first");
    const price = Number(f.price); if (!Number.isFinite(price) || price < 0) throw new Error("Enter a price of $0 or more");
    const m = METHODS.find(x => x.v === f.method);
    if (!m) throw new Error("Choose a work method");
    const hours = f.hours.trim() ? Number(f.hours) : null;
    const minimum = f.minimum_hours.trim() ? Number(f.minimum_hours) : null;
    snowCharge(f.pricing_mode, price, hours, minimum);
    if (f.pricing_mode === "hourly" && f.status === "completed" && hours === null) throw new Error("Enter crew hours or schedule this visit for later");
    const plan = plans.data?.find(p => p.id === f.plan_id);
    const { error } = await supabase.from("jobs").insert({ company_id: companyId, customer_id: customerId, property_id: f.property_id, title: plan?.service ?? `Snow — ${m.l}`, service_kind: plan?.service_kind ?? m.kind, crew_id: f.crew_id || null, pricing_mode: f.pricing_mode, hourly_rate: f.pricing_mode === "hourly" ? price : null, minimum_hours: f.pricing_mode === "hourly" ? minimum : null, worked_hours: f.pricing_mode === "hourly" ? hours : null, scheduled_date: f.date, status: f.status === "scheduled" ? "scheduled" : "completed", completed_at: f.status === "completed" ? new Date().toISOString() : null, price, snow_method: f.method, snow_inches: f.inches ? Number(f.inches) : null, snow_trips: Number(f.trips) || 1, notes: f.notes.trim() || null });
    if (error) throw error;
  }, onSuccess: () => { toast.success("Storm visit logged"); qc.invalidateQueries(); setOpen(false); }, onError: e => toast.error(e.message) });
  const rows = q.data ?? [];
  const season = rows.reduce((s, r) => s + Number(r.price), 0);
  return <section className="my-6 border-y py-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Storm visits</h2><p className="text-sm text-muted-foreground">{rows.length} logged · {money(season)} billed work</p></div>{manage && <Button size="sm" disabled={!properties.length} onClick={() => { setF(blank()); setOpen(true); }}><CloudSnow />Log storm visit</Button>}</div>
    {q.isError && <p role="alert" className="text-destructive">{q.error.message}</p>}
    <div className="divide-y">
      {rows.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-bold">{r.scheduled_date} · {METHODS.find(m => m.v === r.snow_method)?.l}{r.snow_trips && r.snow_trips > 1 ? ` ×${r.snow_trips} trips` : ""}</p><p className="text-sm">{r.snow_inches != null ? `${r.snow_inches}" snow · ` : ""}{money(r.price)} · {r.property?.address}{r.invoice_id ? " · Billed" : " · Not billed yet"}</p><SnowTimeEntry job={r} />{r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}</div>{manage && r.status !== "completed" && !r.invoice_id && <DeleteRecord table="jobs" id={r.id} name={r.title} description="This storm visit will be removed." />}</div>)}
      {!rows.length && <p className="py-3 text-sm text-muted-foreground">No storm visits yet. Log one each time the crew goes out.</p>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Log storm visit</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <div className="space-y-1.5"><Label htmlFor="sv-service">Customer snow service</Label><select id="sv-service" className={sel} value={f.plan_id} onChange={e => { const p = plans.data?.find(p => p.id === e.target.value); if (!p) { setF({ ...f, plan_id: "" }); return; } setF({ ...f, plan_id: p.id, property_id: p.property_id, crew_id: p.crew_id ?? "", price: String(p.price), pricing_mode: p.pricing_mode, minimum_hours: p.minimum_hours == null ? "" : String(p.minimum_hours), method: p.service_kind === "shoveling" ? "shovel" : p.service_kind === "snow_plowing" ? "plow" : "snowblower" }); }}><option value="">Separate storm work</option>{plans.data?.map(p => <option key={p.id} value={p.id}>{p.service} · {money(p.price)}/{p.pricing_mode === "hourly" ? "hr" : "storm"}</option>)}</select></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="sv-status">Visit</Label><select id="sv-status" className={sel} value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="completed">Already completed</option><option value="scheduled">Schedule for crew</option></select></div><div className="space-y-1.5"><Label htmlFor="sv-crew">Crew</Label><select id="sv-crew" className={sel} value={f.crew_id} onChange={e => setF({ ...f, crew_id: e.target.value })}><option value="">Unassigned</option>{crews.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
      <div className="space-y-1.5"><Label htmlFor="sv-pricing">Pricing</Label><select id="sv-pricing" className={sel} value={f.pricing_mode} onChange={e => setF({ ...f, pricing_mode: e.target.value })}><option value="flat">Flat fee per storm</option><option value="hourly">Hourly</option></select></div>
      {f.pricing_mode === "hourly" && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="sv-min">Minimum hours (optional)</Label><Input id="sv-min" type="number" min="0" step="0.01" placeholder="No minimum" value={f.minimum_hours} onChange={e => setF({ ...f, minimum_hours: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-hours">Crew hours worked</Label><Input id="sv-hours" type="number" min="0" step="0.01" required={f.status === "completed"} value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} /></div></div>}
      <div className="space-y-1.5"><Label htmlFor="sv-prop">Property</Label><select id="sv-prop" className={sel} value={f.property_id} onChange={e => setF({ ...f, property_id: e.target.value })}>{properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="sv-date">Storm date</Label><Input id="sv-date" required type="date" className="h-11" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-m">Work done</Label><select id="sv-m" className={sel} value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>{METHODS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div></div>
      <div className="grid grid-cols-3 gap-3"><div className="space-y-1.5"><Label htmlFor="sv-in">Inches</Label><Input id="sv-in" type="number" min="0" step="0.5" className="h-11" value={f.inches} onChange={e => setF({ ...f, inches: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-t">Trips</Label><Input id="sv-t" type="number" min="1" max="50" className="h-11" value={f.trips} onChange={e => setF({ ...f, trips: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-p">{f.pricing_mode === "hourly" ? "Hourly rate ($)" : "Flat fee ($)"}</Label><Input id="sv-p" required type="number" min="0" step="0.01" className="h-11" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div></div>
      <div className="space-y-1.5"><Label htmlFor="sv-n">Notes</Label><Textarea id="sv-n" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
      <Button type="submit" className="w-full" disabled={save.isPending}>Save storm visit</Button>
    </form></DialogContent></Dialog>
  </section>;
}
