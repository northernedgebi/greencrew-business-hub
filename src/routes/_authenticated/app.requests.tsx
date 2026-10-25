import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, Empty, PageHeader, Spinner } from "@/components/app-ui";
import { ScheduleDatePicker } from "@/components/schedule-date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WEEKDAYS } from "@/lib/scheduling";

export const Route = createFileRoute("/_authenticated/app/requests")({
  component: Requests,
  head: () => ({ meta: [{ title: "Customer Requests | LawnOffice" }, { name: "description", content: "Approve visit changes, quote extra work and schedule approved jobs." }, { property: "og:title", content: "Customer Requests | LawnOffice" }, { property: "og:description", content: "Customer portal requests and quotes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const sel = "h-11 w-full rounded-xl border bg-background px-3 text-sm";
const fmt = (d: string) => new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const LABEL: Record<string, string> = { pending: "New", quoted: "Quote sent", approved: "Quote approved — schedule it", declined: "Declined", scheduled: "Scheduled", cancelled: "Cancelled by customer" };

function Requests() {
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const office = can(role, "billing.manage");
  const [tab, setTab] = useState<"open" | "done">("open");
  const q = useQuery({
    queryKey: ["requests", companyId],
    queryFn: async () => {
      const [r, crews, co] = await Promise.all([
        supabase.from("service_requests").select("*, customer:customers(id, name, phone, properties(id, address)), job:jobs!service_requests_job_id_fkey(id, title, scheduled_date, crew_id), estimate:estimates(id, title, total, status)").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("crews").select("id, name").eq("company_id", companyId).order("name"),
        supabase.from("companies").select("booking_weekdays, max_visits_per_day").eq("id", companyId).single(),
      ]);
      if (r.error) throw r.error;
      return { requests: r.data ?? [], crews: crews.data ?? [], company: co.data };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["requests", companyId] }); qc.invalidateQueries({ queryKey: ["jobs", companyId] }); };
  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    const { error } = await p; if (error) { toast.error(error.message); return false; } toast.success(ok); refresh(); return true;
  }
  const setReq = (id: string, patch: Record<string, unknown>) => supabase.from("service_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", id);

  if (!office) return <Empty title="Restricted" text="Only owners and office administrators handle customer requests." />;
  if (!q.data) return <Spinner />;
  const open = q.data.requests.filter((r) => ["pending", "quoted", "approved"].includes(r.status));
  const list = tab === "open" ? open : q.data.requests.filter((r) => !open.includes(r));

  return (
    <>
      <PageHeader title="Customer requests" subtitle="Visit changes and extra work requested from the customer portal." />
      <div className="mb-4 flex gap-2"><Button variant={tab === "open" ? "default" : "outline"} onClick={() => setTab("open")}>Open ({open.length})</Button><Button variant={tab === "done" ? "default" : "outline"} onClick={() => setTab("done")}>History</Button></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {list.length === 0 && <Empty title="Nothing here" text="New customer requests will show up here." />}
          {list.map((r) => <RequestCard key={r.id} r={r as never} crews={q.data.crews} companyId={companyId} run={run} setReq={setReq} />)}
        </div>
        <BookingSettings key={JSON.stringify(q.data.company)} companyId={companyId} initial={q.data.company} run={run} />
      </div>
    </>
  );
}

type Req = { id: string; kind: string; status: string; message: string | null; company_reply: string | null; requested_date: string | null; created_at: string; customer: { id: string; name: string; phone: string | null; properties: { id: string; address: string }[] } | null; job: { id: string; title: string; scheduled_date: string; crew_id: string | null } | null; estimate: { id: string; title: string; total: number; status: string } | null };
type Run = (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>;

function RequestCard({ r, crews, companyId, run, setReq }: { r: Req; crews: { id: string; name: string }[]; companyId: string; run: Run; setReq: (id: string, patch: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> }) {
  const [reply, setReply] = useState("");
  const [quote, setQuote] = useState({ title: "Extra work", total: "", notes: r.message ?? "" });
  const [sched, setSched] = useState({ date: tomorrow(), crew_id: crews[0]?.id ?? "", property_id: r.customer?.properties[0]?.id ?? "" });

  async function approveMove() {
    if (!r.job || !r.requested_date) return;
    const { error } = await supabase.from("jobs").update({ scheduled_date: r.requested_date, route_order: null }).eq("company_id", companyId).eq("id", r.job.id);
    if (error) return toast.error(error.message);
    await run(setReq(r.id, { status: "approved", company_reply: reply.trim() || `Confirmed — your visit is moved to ${fmt(r.requested_date)}.` }), "Visit moved and customer notified");
  }
  async function sendQuote() {
    if (!r.customer || !quote.total) return;
    const { data, error } = await supabase.from("estimates").insert({ company_id: companyId, customer_id: r.customer.id, property_id: r.customer.properties[0]?.id ?? null, title: quote.title, total: Number(quote.total), notes: quote.notes || null, status: "sent" }).select("id").single();
    if (error) return toast.error(error.message);
    await run(setReq(r.id, { status: "quoted", estimate_id: data.id, company_reply: reply.trim() || null }), "Quote sent to customer");
  }
  async function schedule() {
    if (!r.customer || !r.estimate) return;
    const { data, error } = await supabase.from("jobs").insert({ company_id: companyId, customer_id: r.customer.id, property_id: sched.property_id || null, crew_id: sched.crew_id || null, title: r.estimate.title, scheduled_date: sched.date, price: Number(r.estimate.total), notes: r.message, status: "scheduled" }).select("id").single();
    if (error) return toast.error(error.message);
    await run(setReq(r.id, { status: "scheduled", scheduled_job_id: data.id, company_reply: `Scheduled for ${fmt(sched.date)}.` }), "Job scheduled");
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-semibold">{r.customer?.name}{r.customer?.phone ? <span className="font-normal text-muted-foreground"> · {r.customer.phone}</span> : null}</p>
          <p className="text-xs text-muted-foreground">{r.kind === "reschedule" ? "Wants to change a visit day" : "Service request"} · {new Date(r.created_at).toLocaleString()}</p></div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{LABEL[r.status] ?? r.status}</span>
      </div>
      {r.kind === "reschedule" && r.job && <p className="mt-2 text-sm"><span className="font-semibold">{r.job.title}</span>: {fmt(r.job.scheduled_date)} → <span className="font-semibold text-primary">{r.requested_date ? fmt(r.requested_date) : "?"}</span></p>}
      {r.message && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">“{r.message}”</p>}
      {r.company_reply && <p className="mt-2 text-sm text-muted-foreground">Your reply: {r.company_reply}</p>}
      {r.estimate && <p className="mt-2 text-sm">Quote: {r.estimate.title} · {money(Number(r.estimate.total))} · <span className="capitalize">{r.estimate.status}</span></p>}

      {r.status === "pending" && r.kind === "reschedule" && (
        <div className="mt-3 space-y-2">
          <Input placeholder="Optional message to customer" value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="flex gap-2"><Button className="h-11 flex-1" onClick={approveMove}>Approve & confirm</Button><Button className="h-11" variant="outline" onClick={() => run(setReq(r.id, { status: "declined", company_reply: reply.trim() || "Sorry, we can't move this visit to that day." }), "Request declined")}>Decline</Button></div>
        </div>
      )}
      {r.status === "pending" && r.kind === "service" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1"><Label>Quote title</Label><Input value={quote.title} onChange={(e) => setQuote({ ...quote, title: e.target.value })} /></div>
          <div className="space-y-1"><Label>Price</Label><Input type="number" min="0" step="0.01" placeholder="0.00" value={quote.total} onChange={(e) => setQuote({ ...quote, total: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Details for customer</Label><Textarea value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} /></div>
          <Input className="sm:col-span-2" placeholder="Optional message to customer" value={reply} onChange={(e) => setReply(e.target.value)} />
          <Button className="h-11" disabled={!quote.total} onClick={sendQuote}>Send quote</Button>
          <Button className="h-11" variant="outline" onClick={() => run(setReq(r.id, { status: "declined", company_reply: reply.trim() || "Sorry, we can't take this on." }), "Request declined")}>Decline</Button>
        </div>
      )}
      {r.status === "approved" && r.kind === "service" && r.estimate && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Day</Label><ScheduleDatePicker value={sched.date} onChange={(date) => setSched({ ...sched, date })} /></div>
          <div className="space-y-1"><Label>Crew</Label><select className={sel} value={sched.crew_id} onChange={(e) => setSched({ ...sched, crew_id: e.target.value })}><option value="">Unassigned</option>{crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="space-y-1"><Label>Property</Label><select className={sel} value={sched.property_id} onChange={(e) => setSched({ ...sched, property_id: e.target.value })}>{r.customer?.properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
          <Button className="h-11 sm:col-span-2" onClick={schedule}>Schedule job</Button>
        </div>
      )}
    </Card>
  );
}

function BookingSettings({ companyId, initial, run }: { companyId: string; initial: { booking_weekdays: number[]; max_visits_per_day: number } | null; run: Run }) {
  const [days, setDays] = useState<number[]>(initial?.booking_weekdays ?? [1, 2, 3, 4, 5]);
  const [max, setMax] = useState(String(initial?.max_visits_per_day ?? 20));
  return (
    <Card className="self-start">
      <h2 className="font-bold">Customer booking days</h2>
      <p className="mb-3 text-sm text-muted-foreground">Days customers may pick when asking to move a visit, and the most visits per crew per day.</p>
      <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((w, i) => (
        <button key={w} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())} className={`h-10 rounded-lg border px-2.5 text-sm font-semibold ${days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{w.slice(0, 3)}</button>))}</div>
      <Label htmlFor="max-visits" className="mt-3 block">Max visits per crew per day</Label>
      <Input id="max-visits" className="mt-1" type="number" min="1" max="200" value={max} onChange={(e) => setMax(e.target.value)} />
      <Button className="mt-3 w-full" onClick={() => run(supabase.from("companies").update({ booking_weekdays: days, max_visits_per_day: Math.max(1, Number(max) || 1) }).eq("id", companyId), "Booking days saved")}>Save</Button>
    </Card>
  );
}
