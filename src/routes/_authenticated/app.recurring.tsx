import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil } from "lucide-react";
import { ScheduleDatePicker } from "@/components/schedule-date-picker";
import { WEEKDAYS } from "@/lib/scheduling";
import { getDay, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, Empty, PageHeader, Spinner } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCustomerOptions } from "./app.schedule";

export const Route = createFileRoute("/_authenticated/app/recurring")({ component: Recurring, head: () => ({ meta: [{ title: "Recurring Maintenance | LawnOffice" }, { name: "description", content: "Set recurring lawn-cut days, dates, and crews in LawnOffice." }, { property: "og:title", content: "Recurring Maintenance | LawnOffice" }, { property: "og:description", content: "Manage recurring landscaping schedules and crews." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

type Freq = "weekly" | "biweekly" | "monthly";

function Recurring() {
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["plans", companyId],
    queryFn: async () => { const { data, error } = await supabase.from("recurring_plans").select("*, customer:customers(name), property:properties(address), crew:crews(name)").eq("company_id", companyId).order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const gen = useMutation({
    mutationFn: async () => {
      const until = new Date(); until.setDate(until.getDate() + 28);
      const { data, error } = await supabase.rpc("generate_recurring_jobs", { _company: companyId, _until: until.toISOString().slice(0, 10) });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`${n} visits added to the schedule`); qc.invalidateQueries({ queryKey: ["jobs", companyId] }); },
    onError: (e) => toast.error(e.message),
  });
  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from("recurring_plans").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["plans", companyId] });
  }
  const office = can(role, "customers.manage");

  return (
    <>
      <PageHeader title="Recurring maintenance" subtitle="Plans generate visits on the schedule automatically"
        action={<div className="flex gap-2"><Button variant="outline" onClick={() => gen.mutate()} disabled={gen.isPending}><RefreshCw />Fill next 4 weeks</Button>{office && <NewPlan />}</div>} />
      {q.isLoading ? <Spinner /> : q.isError ? <p role="alert" className="text-destructive">{q.error.message}</p> : (q.data ?? []).length === 0 ? <Empty title="No recurring plans" text="Set up weekly, biweekly or monthly service for a property." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {(q.data ?? []).map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{p.service} · <span className="capitalize">{p.frequency}</span></p>
                  <p className="text-sm">{p.customer?.name}</p>
                  <p className="text-sm text-muted-foreground">{p.property?.address} · {p.crew?.name ?? "Unassigned"}</p>
                  <p className="mt-1 text-sm font-medium">{p.frequency === "monthly" ? `Day ${parseISO(p.start_date).getDate()} of month` : WEEKDAYS[getDay(parseISO(p.start_date))]}</p>
                  <p className="mt-2 font-display text-xl font-bold">{money(p.price)}<span className="text-sm font-normal text-muted-foreground"> / visit · from {p.start_date}</span></p>
                </div>
                {office && <Switch aria-label={`Active plan for ${p.customer?.name}`} checked={p.active} onCheckedChange={(v) => toggle(p.id, v)} />}
              </div>
              {office && <div className="mt-3"><NewPlan plan={p} /></div>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

type EditablePlan = { id: string; customer_id: string; property_id: string; crew_id: string | null; service: string; frequency: Freq; price: number; start_date: string };

function NewPlan({ plan }: { plan?: EditablePlan }) {
  const { companyId } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const customers = useCustomerOptions(companyId);
  const crews = useQuery({ queryKey: ["crews", companyId], queryFn: async () => (await supabase.from("crews").select("id, name").eq("company_id", companyId)).data ?? [] });
  const initial = () => ({ customer_id: plan?.customer_id ?? "", property_id: plan?.property_id ?? "", crew_id: plan?.crew_id ?? "", service: plan?.service ?? "Weekly mowing", frequency: plan?.frequency ?? "weekly" as Freq, price: String(plan?.price ?? 45), start_date: plan?.start_date ?? new Date().toLocaleDateString("en-CA") });
  const [f, setF] = useState(initial);
  const props = customers.data?.find((c) => c.id === f.customer_id)?.properties ?? [];
  const m = useMutation({
    mutationFn: async () => {
      if (!f.property_id) throw new Error("This customer needs a property first");
      const payload = { company_id: companyId, customer_id: f.customer_id, property_id: f.property_id, crew_id: f.crew_id || null, service: f.service, frequency: f.frequency, price: Number(f.price), start_date: f.start_date };
      const { error } = plan ? await supabase.from("recurring_plans").update(payload).eq("company_id", companyId).eq("id", plan.id).select("id").single() : await supabase.from("recurring_plans").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(plan ? "Plan updated for newly generated visits" : "Plan created"); qc.invalidateQueries({ queryKey: ["plans", companyId] }); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const sel = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) setF(initial()); }}>
      <DialogTrigger asChild>{plan ? <Button variant="outline" size="sm"><Pencil />Edit plan</Button> : <Button><Plus />New plan</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{plan ? "Edit recurring plan" : "New recurring plan"}</DialogTitle></DialogHeader>
        {plan && <p className="text-sm text-muted-foreground">Applies to newly generated visits. Existing visits stay on the schedule and can be edited individually.</p>}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Customer</Label>
            <select className={sel} required value={f.customer_id} onChange={(e) => { const c = customers.data?.find((x) => x.id === e.target.value); setF({ ...f, customer_id: e.target.value, property_id: c?.properties[0]?.id ?? "" }); }}>
              <option value="">Select…</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {props.length > 0 && <div className="space-y-1.5"><Label>Property</Label><select className={sel} value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}>{props.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>}
          <div className="space-y-1.5"><Label>Service</Label><Input className="h-11" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Frequency</Label><select className={sel} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Freq })}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option></select></div>
            <div className="space-y-1.5"><Label>Price per visit</Label><Input className="h-11" type="number" step="0.01" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>First visit / weekday</Label><ScheduleDatePicker value={f.start_date} onChange={(start_date) => setF({ ...f, start_date })} label="First visit date" /></div>
            <div className="space-y-1.5"><Label>Crew</Label><select className={sel} value={f.crew_id} onChange={(e) => setF({ ...f, crew_id: e.target.value })}><option value="">Unassigned</option>{crews.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>{m.isPending ? "Saving…" : plan ? "Save plan" : "Create plan"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
