import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, MapPin, Play, Check, X, Receipt, Pencil, RefreshCw } from "lucide-react";
import { MonthCalendar } from "@/components/month-calendar";
import { ScheduleDatePicker } from "@/components/schedule-date-picker";
import { WEEKDAYS } from "@/lib/scheduling";
import { getDay, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { canSeeCrewDate, isCrewUser } from "@/lib/crew-access";
import { Switch } from "@/components/ui/switch";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/schedule")({ component: Schedule, head: () => ({ meta: [{ title: "Schedule & Recurring | LawnOffice" }, { name: "description", content: "Assign crews, edit lawn cuts, manage recurring plans, and move scheduled visits in LawnOffice." }, { property: "og:title", content: "Schedule & Recurring | LawnOffice" }, { property: "og:description", content: "Manage landscaping visits, crews and recurring schedules." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00"); d.setDate(d.getDate() + n); return iso(d); };

type Status = "scheduled" | "in_progress" | "completed" | "cancelled";

function Schedule() {
  const { role } = useWorkspace();
  const restricted = isCrewUser(role);
  const showTabs = !restricted && can(role, "jobs.manage");
  const [tab, setTab] = useState<"visits" | "month" | "recurring">("visits");
  const [openDay, setOpenDay] = useState<string | undefined>(undefined);
  return (
    <>
      {showTabs && (
        <div className="mb-4 flex gap-2" role="tablist">
          <Button variant={tab === "visits" ? "default" : "outline"} onClick={() => setTab("visits")}>Visits</Button>
          <Button variant={tab === "month" ? "default" : "outline"} onClick={() => setTab("month")}>Month</Button>
          <Button variant={tab === "recurring" ? "default" : "outline"} onClick={() => setTab("recurring")}>Recurring plans</Button>
        </div>
      )}
      {(!showTabs || tab === "visits") && <Visits key={openDay ?? "today"} initialDay={openDay} />}
      {showTabs && tab === "month" && <MonthCalendar onOpenDay={(d) => { setOpenDay(d); setTab("visits"); }} />}
      {showTabs && tab === "recurring" && <RecurringSection />}
    </>
  );
}

function Visits({ initialDay }: { initialDay?: string | undefined }) {
  const { companyId, role, current } = useWorkspace();
  const restricted = isCrewUser(role);
  const qc = useQueryClient();
  const [day, setDay] = useState(initialDay ?? iso(new Date()));
  const selectedDay = restricted && current?.schedule_visible_from && current.schedule_visible_until
    ? day < current.schedule_visible_from ? current.schedule_visible_from : day > current.schedule_visible_until ? current.schedule_visible_until : day
    : day;
  const visibleDay = !restricted || canSeeCrewDate(current, selectedDay);
  const [crewFilter, setCrewFilter] = useState("all");
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(selectedDay, i - 3)), [selectedDay]);

  const crews = useQuery({
    queryKey: ["crews", companyId],
    queryFn: async () => (await supabase.from("crews").select("id, name").eq("company_id", companyId).order("name")).data ?? [],
  });
  const q = useQuery({
    queryKey: ["jobs", companyId, selectedDay, current?.crew_id, current?.schedule_visible_from, current?.schedule_visible_until],
    enabled: visibleDay,
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs")
        .select("id, title, scheduled_date, status, price, start_time, notes, invoice_id, customer_id, property_id, crew_id, route_order, customer:customers(name, phone), property:properties(address, city, zip, gate_code), crew:crews(name)")
        .eq("company_id", companyId).eq("scheduled_date", selectedDay);
      if (error) throw error;
      // Saved route order first (Routes page), then start time, ZIP, street.
      return (data ?? []).sort((a, b) => (a.route_order ?? 9999) - (b.route_order ?? 9999) || (a.start_time ?? "99").localeCompare(b.start_time ?? "99") || (a.property?.zip ?? "").localeCompare(b.property?.zip ?? "") || (a.property?.address ?? "").localeCompare(b.property?.address ?? ""));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("jobs").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", companyId] }),
    onError: (e) => toast.error(e.message),
  });

  async function invoiceJob(j: { id: string; title: string; price: number; customer_id: string }) {
    const inv = await supabase.from("invoices").insert({ company_id: companyId, customer_id: j.customer_id, status: "sent" }).select("id").single();
    if (inv.error) return toast.error(inv.error.message);
    const it = await supabase.from("invoice_items").insert({ company_id: companyId, invoice_id: inv.data.id, description: `${j.title} (${day})`, quantity: 1, unit_price: j.price, job_id: j.id });
    if (it.error) return toast.error(it.error.message);
    await supabase.from("jobs").update({ invoice_id: inv.data.id }).eq("id", j.id);
    toast.success("Invoice created");
    qc.invalidateQueries({ queryKey: ["jobs", companyId] });
  }

  const jobs = (q.data ?? []).filter((j) => crewFilter === "all" || (crewFilter === "none" ? !j.crew_id : j.crew_id === crewFilter));
  const dayTotal = jobs.filter((j) => j.status !== "cancelled").reduce((s, j) => s + Number(j.price), 0);

  return (
    <>
      <PageHeader title={restricted ? "My crew schedule" : "Schedule & dispatch"} subtitle={restricted ? `${jobs.length} stops` : `${jobs.length} stops · ${money(dayTotal)}`} action={visibleDay && can(role, "jobs.manage") && <NewJob day={selectedDay} />} />
      {restricted && <p className="mb-4 text-sm text-muted-foreground">{current?.crew_id && current.schedule_visible_from && current.schedule_visible_until ? `Enabled dates: ${current.schedule_visible_from} through ${current.schedule_visible_until}` : "Schedule access is paused. No crew or date range is enabled."}</p>}
      {visibleDay && <><div className="mb-4 max-w-sm"><ScheduleDatePicker value={selectedDay} onChange={setDay} label="Schedule date" min={restricted ? current?.schedule_visible_from ?? undefined : undefined} max={restricted ? current?.schedule_visible_until ?? undefined : undefined} /></div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous week" disabled={restricted && !!current?.schedule_visible_from && selectedDay <= current.schedule_visible_from} onClick={() => setDay(addDays(selectedDay, -7))}><ChevronLeft /></Button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const dt = new Date(d + "T00:00");
            return (
              <Button variant={d === selectedDay ? "default" : "ghost"} key={d} disabled={restricted && !canSeeCrewDate(current, d)} onClick={() => setDay(d)} className={`h-auto flex-col gap-0 rounded-md px-0 py-2 text-center ${d === selectedDay ? "" : "bg-card"} ${d === iso(new Date()) && d !== selectedDay ? "ring-2 ring-lime" : ""}`}>
                <span className="block text-[10px] uppercase opacity-70">{dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="font-display text-lg font-bold">{dt.getDate()}</span>
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="icon" aria-label="Next week" disabled={restricted && !!current?.schedule_visible_until && selectedDay >= current.schedule_visible_until} onClick={() => setDay(addDays(selectedDay, 7))}><ChevronRight /></Button>
      </div>
      {!restricted && <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[{ id: "all", name: "All crews" }, ...(crews.data ?? []), { id: "none", name: "Unassigned" }].map((c) => (
          <Button key={c.id} variant={crewFilter === c.id ? "secondary" : "outline"} onClick={() => setCrewFilter(c.id)} className="h-11 shrink-0">{c.name}</Button>
        ))}
      </div>}</>}

      {!visibleDay ? <Empty title="No schedule dates enabled" /> : q.isLoading ? <Spinner /> : jobs.length === 0 ? <Empty title="No visits this day" text={restricted ? undefined : "Create a job or generate visits from recurring plans."} /> : (
        <div className="space-y-3">
          {jobs.map((j, idx) => (
            <Card key={j.id}>
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest font-bold text-forest-foreground">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{j.title}</p><StatusBadge status={j.status} /></div>
                  <p className="text-sm">{j.customer?.name}{j.crew ? ` · ${j.crew.name}` : " · Unassigned"}{j.start_time ? ` · ${j.start_time.slice(0, 5)}` : ""} · {money(j.price)}</p>
                  {j.property && (
                    <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?daddr=${encodeURIComponent([j.property.address, j.property.city, j.property.zip].filter(Boolean).join(", "))}`} className="mt-1 flex items-center gap-1 text-sm text-primary">
                      <MapPin className="h-4 w-4" />{j.property.address}{j.property.gate_code ? ` · Gate ${j.property.gate_code}` : ""}
                    </a>
                  )}
                  {j.notes && <p className="mt-1 text-sm text-muted-foreground">{j.notes}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {can(role, "jobs.manage") && j.status !== "completed" && j.status !== "cancelled" && <NewJob day={selectedDay} job={j} onSaved={setDay} />}
                {j.status === "scheduled" && <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: j.id, status: "in_progress" })}><Play />Start</Button>}
                {(j.status === "scheduled" || j.status === "in_progress") && <Button size="sm" onClick={() => setStatus.mutate({ id: j.id, status: "completed" })}><Check />Complete</Button>}
                {j.status !== "cancelled" && j.status !== "completed" && can(role, "jobs.manage") && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: j.id, status: "cancelled" })}><X />Cancel</Button>}
                {j.status === "completed" && !j.invoice_id && can(role, "billing.manage") && <Button size="sm" variant="outline" onClick={() => invoiceJob({ ...j, price: Number(j.price) })}><Receipt />Invoice</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function useCustomerOptions(companyId: string) {
  return useQuery({
    queryKey: ["customer-options", companyId],
    queryFn: async () => (await supabase.from("customers").select("id, name, properties(id, address)").eq("company_id", companyId).eq("status", "active").order("name")).data ?? [],
  });
}

type EditableJob = { id: string; customer_id: string; property_id: string | null; crew_id: string | null; title: string; scheduled_date: string; start_time: string | null; price: number; notes: string | null; invoice_id: string | null };

function NewJob({ day, job, onSaved }: { day: string; job?: EditableJob; onSaved?: (day: string) => void }) {
  const { companyId, role, current } = useWorkspace();
  const restricted = isCrewUser(role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const customers = useCustomerOptions(companyId);
  const crews = useQuery({ queryKey: ["crews", companyId], queryFn: async () => (await supabase.from("crews").select("id, name").eq("company_id", companyId).order("name")).data ?? [] });
  const initial = () => ({ customer_id: job?.customer_id ?? "", property_id: job?.property_id ?? "", crew_id: job?.crew_id ?? (restricted ? current?.crew_id ?? "" : ""), title: job?.title ?? "Lawn mowing", scheduled_date: job?.scheduled_date ?? day, start_time: job?.start_time?.slice(0, 5) ?? "", price: String(job?.price ?? 45), notes: job?.notes ?? "" });
  const [f, setF] = useState(initial);
  const props = customers.data?.find((c) => c.id === f.customer_id)?.properties ?? [];
  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: companyId, customer_id: f.customer_id, property_id: f.property_id || null, crew_id: f.crew_id || null,
        title: f.title, scheduled_date: f.scheduled_date, start_time: f.start_time || null, price: Number(f.price || 0), notes: f.notes || null,
      };
      const { error } = job
        ? await supabase.from("jobs").update(payload).eq("company_id", companyId).eq("id", job.id).select("id").single()
        : await supabase.from("jobs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(job ? "Visit updated" : "Job scheduled"); qc.invalidateQueries({ queryKey: ["jobs", companyId] }); qc.invalidateQueries({ queryKey: ["dashboard", companyId] }); setOpen(false); onSaved?.(f.scheduled_date); },
    onError: (e) => toast.error(e.message),
  });
  const sel = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(initial()); }}>
      <DialogTrigger asChild>{job ? <Button size="sm" variant="outline"><Pencil />Edit / move</Button> : <Button><Plus />New job</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{job ? "Edit scheduled visit" : "Schedule a job"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Customer</Label>
            <select className={sel} required value={f.customer_id} onChange={(e) => { const c = customers.data?.find((x) => x.id === e.target.value); setF({ ...f, customer_id: e.target.value, property_id: c?.properties[0]?.id ?? "" }); }}>
              <option value="">Select…</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          {props.length > 0 && <div className="space-y-1.5"><Label>Property</Label>
            <select className={sel} value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}>{props.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>}
          <div className="space-y-1.5"><Label>Service</Label><Input className="h-11" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date / weekday</Label><ScheduleDatePicker value={f.scheduled_date} onChange={(scheduled_date) => setF({ ...f, scheduled_date })} label="Visit date" min={restricted ? current?.schedule_visible_from ?? undefined : undefined} max={restricted ? current?.schedule_visible_until ?? undefined : undefined} /></div>
            <div className="space-y-1.5"><Label>Time</Label><Input className="h-11" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Crew</Label>
              <select className={sel} disabled={restricted} value={f.crew_id} onChange={(e) => setF({ ...f, crew_id: e.target.value })}>{!restricted && <option value="">Unassigned</option>}{crews.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label>Price ($)</Label><Input className="h-11" type="number" min="0" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes for crew</Label><Input className="h-11" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>{m.isPending ? "Saving…" : job ? "Save changes" : "Schedule"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Freq = "weekly" | "biweekly" | "monthly";

function RecurringSection() {
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
