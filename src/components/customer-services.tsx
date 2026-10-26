import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { FREQUENCIES, customerMonthlyValue, newServiceForm, servicePayload, summarizeCustomerServices, type ServiceForm } from "@/lib/customer-services";
import { localDate } from "@/lib/scheduling";
import { CustomerServiceFields } from "@/components/customer-service-fields";
import { NearbyServiceSuggestions } from "@/components/nearby-service-suggestions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteRecord } from "@/components/delete-record";

export function CustomerServices({ customerId, properties }: { customerId: string; properties: { id: string; address: string }[] }) {
  const { companyId, role } = useWorkspace();
  const manage = can(role, "customers.manage");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [property, setProperty] = useState(properties[0]?.id ?? "");
  const [f, setF] = useState<ServiceForm>(newServiceForm);
  const crews = useQuery({ queryKey: ["crews", companyId], queryFn: async () => { const { data, error } = await supabase.from("crews").select("id,name").eq("company_id", companyId); if (error) throw error; return data ?? []; } });
  const q = useQuery({ queryKey: ["customer-services", companyId, customerId], queryFn: async () => {
    const [plans, visits] = await Promise.all([
      supabase.from("recurring_plans").select("*,property:properties(address),crew:crews(name)").eq("company_id", companyId).eq("customer_id", customerId).order("created_at"),
      supabase.from("jobs").select("id,title,scheduled_date,price,recurring_plan_id,crew:crews(name)").eq("company_id", companyId).eq("customer_id", customerId).eq("status", "scheduled").gte("scheduled_date", localDate(new Date())).order("scheduled_date"),
    ]);
    if (plans.error) throw plans.error; if (visits.error) throw visits.error;
    return { plans: plans.data ?? [], visits: visits.data ?? [] };
  }});
  const summary = q.data ? summarizeCustomerServices(q.data.plans, q.data.visits.filter((v: { recurring_plan_id: string | null }) => !v.recurring_plan_id).map((v: { title: string; price: number }) => ({ title: v.title, price: v.price }))) : [];
  const monthly = q.data ? customerMonthlyValue(q.data.plans) : 0;
  const save = useMutation({ mutationFn: async () => {
    if (!property) throw new Error("Add a service address first");
    if (planId && f.frequency !== "once") {
      const { error } = await supabase.from("recurring_plans").update({ property_id: property, service: f.title, service_kind: f.kind, frequency: f.frequency, start_date: f.date, price: Number(f.price), crew_id: f.crew_id || null, notes: f.notes || null }).eq("id", planId).eq("company_id", companyId).eq("customer_id", customerId).select("id").single();
      if (error) throw error;
    } else {
      if (planId) throw new Error("Add a separate one-time service instead");
      const { error } = await supabase.rpc("add_customer_service", { _company: companyId, _customer: customerId, _service: { ...servicePayload(f), property_id: property } });
      if (error) throw error;
    }
  }, onSuccess: () => { toast.success(planId ? "Service updated for future visits" : "Service added and scheduled"); qc.invalidateQueries(); setOpen(false); }, onError: e => toast.error(e.message) });
  const fill = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("generate_recurring_jobs", { _company: companyId, _until: localDate(addDays(new Date(), 28)) }); if (error) throw error; }, onSuccess: () => { toast.success("Next four weeks filled"); qc.invalidateQueries(); }, onError: e => toast.error(e.message) });
  async function toggle(id: string, active: boolean) { const { error } = await supabase.from("recurring_plans").update({ active }).eq("id", id).eq("company_id", companyId); if (error) return toast.error(error.message); qc.invalidateQueries(); }
  return <section className="my-6 border-y py-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Services & tasks</h2>{manage && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={fill.isPending} onClick={() => fill.mutate()}><RefreshCw />Fill next 4 weeks</Button><Button size="sm" disabled={!properties.length} onClick={() => { setPlanId(null); setF({ ...newServiceForm(), title: "", kind: "other", frequency: "once" }); setProperty(properties[0]?.id ?? ""); setOpen(true); }}><Plus />Add service</Button></div>}</div>
    {q.data && !!summary.length && <div className="mb-4 rounded-lg border bg-muted/40 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work this customer gets done</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {summary.map(s => <div key={s.name} className="flex items-baseline justify-between gap-3 rounded-md border bg-background px-3 py-2">
          <span className="font-bold">{s.name}</span>
          <span className="text-sm text-muted-foreground">{FREQUENCIES.find(f => f.value === s.frequency)?.label} · {s.prices.every(p => p === s.prices[0]) ? money(s.prices[0]) : `${money(Math.min(...s.prices))}–${money(Math.max(...s.prices))}`}{s.count > 1 ? ` · ${s.count}x` : ""}</span>
        </div>)}
      </div>
      {monthly > 0 && <p className="mt-2 text-sm text-muted-foreground">About {money(monthly)} / month across all services</p>}
    </div>}
    <NearbyServiceSuggestions customerId={customerId} />
    {q.isError && <p role="alert" className="text-destructive">{q.error.message}</p>}
    {q.isLoading ? <p className="text-muted-foreground">Loading services…</p> : <div className="divide-y">
      {q.data?.plans.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-bold">{p.service} <span className="text-sm font-normal capitalize text-muted-foreground">· {p.frequency}{!p.active ? " · Paused" : ""}</span></p><p className="text-sm">{money(p.price)} / visit · {p.property?.address} · {p.crew?.name ?? "Unassigned"}</p><p className="text-sm text-muted-foreground">First visit {p.start_date} · Next booked {q.data.visits.find(v => v.recurring_plan_id === p.id)?.scheduled_date ?? "Not yet generated"}</p></div>{manage && <div className="flex flex-wrap items-center gap-3"><Switch aria-label={`Active ${p.service}`} checked={p.active} onCheckedChange={v => toggle(p.id, v)} /><Button size="sm" variant="outline" onClick={() => { setPlanId(p.id); setProperty(p.property_id); setF({ title: p.service, kind: p.service_kind, frequency: p.frequency, date: p.start_date, price: String(p.price), crew_id: p.crew_id ?? "", notes: p.notes ?? "" }); setOpen(true); }}><Pencil />Edit service</Button><DeleteRecord table="recurring_plans" id={p.id} name={p.service} description="This recurring service stops generating visits. Existing bookings and completed work stay; delete individual bookings separately." /></div>}</div>)}
      {q.data?.visits.filter(v => !v.recurring_plan_id).map(v => <div key={v.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-bold">{v.title} <span className="text-sm font-normal text-muted-foreground">· One time</span></p><p className="text-sm">{v.scheduled_date} · {money(v.price)} · {v.crew?.name ?? "Unassigned"}</p></div>{manage && <DeleteRecord table="jobs" id={v.id} name={v.title} description="This one-time service and its visit will be removed from the schedule and route. Existing invoice charges stay unchanged." />}</div>)}
      {!q.data?.plans.length && !q.data?.visits.length && <p className="py-3 text-sm text-muted-foreground">No services scheduled.</p>}
    </div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{planId ? "Edit service" : "Add service"}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      {planId && <p className="text-sm text-muted-foreground">Changes apply to newly generated visits. Existing bookings stay unchanged.</p>}
      <div className="space-y-1.5"><Label>Property</Label><Select value={property} onValueChange={setProperty}><SelectTrigger aria-label="Service property"><SelectValue placeholder="Select property" /></SelectTrigger><SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}</SelectContent></Select></div>
      <CustomerServiceFields value={f} onChange={setF} crews={crews.data ?? []} />
      <Button type="submit" className="w-full" disabled={save.isPending}>Save service</Button>
    </form></DialogContent></Dialog>
  </section>;
}