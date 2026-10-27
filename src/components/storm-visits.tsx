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
  const blank = () => ({ property_id: properties[0]?.id ?? "", date: localDate(new Date()), method: "plow", inches: "", trips: "1", price: "", notes: "" });
  const [f, setF] = useState(blank);
  const q = useQuery({ queryKey: ["storm-visits", companyId, customerId], queryFn: async () => {
    const { data, error } = await supabase.from("jobs").select("id,title,scheduled_date,price,snow_inches,snow_trips,snow_method,invoice_id,notes,property:properties(address)").eq("company_id", companyId).eq("customer_id", customerId).not("snow_method", "is", null).order("scheduled_date", { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  const save = useMutation({ mutationFn: async () => {
    if (!f.property_id) throw new Error("Add a service address first");
    const price = Number(f.price); if (!Number.isFinite(price) || price < 0) throw new Error("Enter a price of $0 or more");
    const m = METHODS.find(x => x.v === f.method)!;
    const { error } = await supabase.from("jobs").insert({ company_id: companyId, customer_id: customerId, property_id: f.property_id, title: `Snow — ${m.l}`, service_kind: m.kind, scheduled_date: f.date, status: "completed", completed_at: new Date().toISOString(), price, snow_method: f.method, snow_inches: f.inches ? Number(f.inches) : null, snow_trips: Number(f.trips) || 1, notes: f.notes.trim() || null });
    if (error) throw error;
  }, onSuccess: () => { toast.success("Storm visit logged"); qc.invalidateQueries(); setOpen(false); }, onError: e => toast.error(e.message) });
  const rows = q.data ?? [];
  const season = rows.reduce((s, r) => s + Number(r.price), 0);
  return <section className="my-6 border-y py-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Storm visits</h2><p className="text-sm text-muted-foreground">{rows.length} logged · {money(season)} billed work</p></div>{manage && <Button size="sm" disabled={!properties.length} onClick={() => { setF(blank()); setOpen(true); }}><CloudSnow />Log storm visit</Button>}</div>
    {q.isError && <p role="alert" className="text-destructive">{q.error.message}</p>}
    <div className="divide-y">
      {rows.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-bold">{r.scheduled_date} · {METHODS.find(m => m.v === r.snow_method)?.l}{r.snow_trips && r.snow_trips > 1 ? ` ×${r.snow_trips} trips` : ""}</p><p className="text-sm">{r.snow_inches != null ? `${r.snow_inches}" snow · ` : ""}{money(r.price)} · {r.property?.address}{r.invoice_id ? " · Billed" : " · Not billed yet"}</p>{r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}</div>{manage && !r.invoice_id && <DeleteRecord table="jobs" id={r.id} name={r.title} description="This storm visit will be removed." />}</div>)}
      {!rows.length && <p className="py-3 text-sm text-muted-foreground">No storm visits yet. Log one each time the crew goes out.</p>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log storm visit</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <div className="space-y-1.5"><Label htmlFor="sv-prop">Property</Label><select id="sv-prop" className={sel} value={f.property_id} onChange={e => setF({ ...f, property_id: e.target.value })}>{properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="sv-date">Storm date</Label><Input id="sv-date" required type="date" className="h-11" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-m">Work done</Label><select id="sv-m" className={sel} value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>{METHODS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div></div>
      <div className="grid grid-cols-3 gap-3"><div className="space-y-1.5"><Label htmlFor="sv-in">Inches</Label><Input id="sv-in" type="number" min="0" step="0.5" className="h-11" value={f.inches} onChange={e => setF({ ...f, inches: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-t">Trips</Label><Input id="sv-t" type="number" min="1" max="50" className="h-11" value={f.trips} onChange={e => setF({ ...f, trips: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="sv-p">Price ($)</Label><Input id="sv-p" required type="number" min="0" step="0.01" className="h-11" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div></div>
      <div className="space-y-1.5"><Label htmlFor="sv-n">Notes</Label><Textarea id="sv-n" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
      <Button type="submit" className="w-full" disabled={save.isPending}>Save storm visit</Button>
    </form></DialogContent></Dialog>
  </section>;
}
