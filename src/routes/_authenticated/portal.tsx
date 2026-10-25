import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Logo } from "@/components/marketing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({ meta: [{ title: "Customer portal — LawnOffice" }, { name: "description", content: "See your lawn care schedule, bills and requests." }, { property: "og:title", content: "Customer portal — LawnOffice" }, { property: "og:description", content: "Your lawn care schedule, bills and requests." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Portal,
});

const fmt = (d: string) => new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const REQ_LABEL: Record<string, string> = { pending: "Waiting for approval", quoted: "Quote ready", approved: "Approved", declined: "Declined", scheduled: "Scheduled", cancelled: "Cancelled" };
type Visit = { id: string; title: string; scheduled_date: string; status: string; property: { address: string } | null };

function Portal() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [moving, setMoving] = useState<Visit | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["portal", ws.userId],
    enabled: !!ws.userId,
    queryFn: async () => {
      const me = (await supabase.from("customers").select("id, name, company:companies(name, phone, email)").eq("portal_user_id", ws.userId)).data ?? [];
      const ids = me.map((c) => c.id);
      if (!ids.length) return null;
      const today = new Date().toISOString().slice(0, 10);
      const [jobs, invoices, payments, requests, quotes] = await Promise.all([
        supabase.from("jobs").select("id, title, scheduled_date, status, property:properties(address)").in("customer_id", ids).gte("scheduled_date", today).neq("status", "cancelled").order("scheduled_date").limit(20),
        supabase.from("invoices").select("id, number, total, amount_paid, status, due_date, issue_date").in("customer_id", ids).neq("status", "draft").neq("status", "void").order("issue_date", { ascending: false }),
        supabase.from("payments").select("id, amount, paid_at, method, invoice:invoices(number)").order("paid_at", { ascending: false }).limit(20),
        supabase.from("service_requests").select("*").in("customer_id", ids).order("created_at", { ascending: false }).limit(30),
        supabase.from("estimates").select("id, title, total, notes, status, valid_until").in("customer_id", ids).neq("status", "draft").order("created_at", { ascending: false }),
      ]);
      return { me, jobs: (jobs.data ?? []) as Visit[], invoices: invoices.data ?? [], payments: payments.data ?? [], requests: requests.data ?? [], quotes: quotes.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["portal", ws.userId] });
  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); refresh(); return true;
  }
  async function signOut() { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  const d = q.data;
  const balance = d?.invoices.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0) ?? 0;
  const paid = d?.invoices.reduce((s, i) => s + Number(i.amount_paid), 0) ?? 0;
  const me = d?.me[0];
  const company = me?.company as { name: string; phone: string | null; email: string | null } | null | undefined;
  const pendingMove = (jobId: string) => d?.requests.find((r) => r.job_id === jobId && r.status === "pending");

  return (
    <div className="min-h-screen pb-10">
      <header className="flex h-16 items-center justify-between bg-forest px-4"><Logo light /><Button variant="heroOutline" size="sm" onClick={signOut}>Sign out</Button></header>
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        {q.isLoading ? <Spinner /> : !d || !me ? <Empty title="No account linked" text="Ask your landscaping company to add this email address to your customer record, then sign in again." /> : (
          <>
            <PageHeader title={`Hi, ${me.name}`} subtitle={company ? `Lawn care by ${company.name}${company.phone ? ` · ${company.phone}` : ""}` : undefined} />
            <div className="grid grid-cols-2 gap-3">
              <Card><p className="text-xs uppercase text-muted-foreground">Balance due</p><p className="font-display text-2xl font-extrabold">{money(balance)}</p></Card>
              <Card><p className="text-xs uppercase text-muted-foreground">Paid so far</p><p className="font-display text-2xl font-extrabold">{money(paid)}</p></Card>
            </div>

            {d.quotes.some((x) => x.status === "sent") && (<>
              <h2 className="mb-2 mt-6 font-bold">Quotes waiting for you</h2>
              <div className="space-y-2">{d.quotes.filter((x) => x.status === "sent").map((x) => (
                <Card key={x.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{x.title}</p>{x.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{x.notes}</p>}{x.valid_until && <p className="text-xs text-muted-foreground">Valid until {fmt(x.valid_until)}</p>}</div><p className="font-display text-2xl font-extrabold">{money(Number(x.total))}</p></div>
                  <div className="mt-3 flex gap-2"><Button className="h-11 flex-1" disabled={busy} onClick={() => act(() => supabase.rpc("portal_respond_estimate", { _estimate: x.id, _accept: true }), "Quote approved — we'll schedule it")}>Approve quote</Button><Button className="h-11" variant="outline" disabled={busy} onClick={() => act(() => supabase.rpc("portal_respond_estimate", { _estimate: x.id, _accept: false }), "Quote declined")}>Decline</Button></div></Card>
              ))}</div>
            </>)}

            <h2 className="mb-2 mt-6 font-bold">Upcoming visits</h2>
            <Card className="divide-y !p-0">{d.jobs.length === 0 ? <p className="p-4 text-sm text-muted-foreground">None scheduled.</p> : d.jobs.map((j) => { const p = pendingMove(j.id); return (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div><p className="font-semibold">{fmt(j.scheduled_date)} · {j.title}</p><p className="text-muted-foreground">{j.property?.address}</p>{p?.requested_date && <p className="text-xs font-semibold text-primary">Move to {fmt(p.requested_date)} requested — waiting for approval</p>}</div>
                <div className="flex items-center gap-2"><StatusBadge status={j.status} />{j.status === "scheduled" && !p && <Button size="sm" variant="outline" className="h-10" onClick={() => setMoving(j)}><CalendarClock />Change day</Button>}</div>
              </div>); })}</Card>

            <h2 className="mb-2 mt-6 font-bold">Send a note or request</h2>
            <Card>
              <Label htmlFor="portal-note">What can we help with?</Label>
              <Textarea id="portal-note" className="mt-1.5 min-h-24" maxLength={2000} placeholder="Example: when the crew comes this week, can they also weed behind the garage?" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button className="mt-3 h-11 w-full sm:w-auto" disabled={busy || !note.trim() || !me} onClick={async () => { if (await act(() => supabase.rpc("portal_request_service", { _customer: me.id, _message: note }), "Sent — we'll get back to you")) setNote(""); }}><MessageSquarePlus />Send</Button>
            </Card>

            {d.requests.length > 0 && (<>
              <h2 className="mb-2 mt-6 font-bold">Your requests</h2>
              <Card className="divide-y !p-0">{d.requests.map((r) => (
                <div key={r.id} className="p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{r.kind === "reschedule" ? `Change visit to ${r.requested_date ? fmt(r.requested_date) : ""}` : "Service request"}</p><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{REQ_LABEL[r.status] ?? r.status}</span></div>
                  {r.message && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.message}</p>}
                  {r.company_reply && <p className="mt-1.5 rounded-lg bg-muted px-2.5 py-1.5"><span className="font-semibold">{company?.name ?? "Reply"}:</span> {r.company_reply}</p>}
                  {(r.status === "pending" || r.status === "quoted") && <button className="mt-1.5 text-xs font-semibold text-destructive" disabled={busy} onClick={() => act(() => supabase.rpc("portal_cancel_request", { _id: r.id }), "Request cancelled")}>Cancel request</button>}
                </div>))}</Card>
            </>)}

            <h2 className="mb-2 mt-6 font-bold">Bills</h2>
            <Card className="divide-y !p-0">{d.invoices.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No bills yet.</p> : d.invoices.map((i) => (
              <div key={i.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><div><p className="font-semibold">Invoice #{i.number}</p><p className="text-muted-foreground">Due {fmt(i.due_date)} · total {money(Number(i.total))} · paid {money(Number(i.amount_paid))}</p></div><span className="flex items-center gap-2 font-semibold">{money(Number(i.total) - Number(i.amount_paid))} due<StatusBadge status={i.status} /></span></div>))}</Card>

            {d.payments.length > 0 && (<>
              <h2 className="mb-2 mt-6 font-bold">Payments</h2>
              <Card className="divide-y !p-0">{d.payments.map((p) => (
                <div key={p.id} className="flex justify-between p-4 text-sm"><span>{new Date(p.paid_at).toLocaleDateString()} · {p.method}{p.invoice ? ` · invoice #${(p.invoice as { number: number }).number}` : ""}</span><span className="font-semibold">{money(Number(p.amount))}</span></div>))}</Card>
            </>)}
          </>
        )}
      </main>
      {moving && <MoveVisit visit={moving} busy={busy} onClose={() => setMoving(null)} onRequest={async (date, msg) => { if (await act(() => supabase.rpc("portal_request_reschedule", { _job: moving.id, _date: date, _message: msg }), "Request sent — the company will confirm")) setMoving(null); }} />}
    </div>
  );
}

function MoveVisit({ visit, busy, onClose, onRequest }: { visit: Visit; busy: boolean; onClose: () => void; onRequest: (date: string, msg: string) => void }) {
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");
  const days = useQuery({
    queryKey: ["portal-days", visit.id],
    queryFn: async () => {
      const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 21);
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc("portal_available_days", { _job: visit.id, _from: iso(from), _to: iso(to) });
      if (error) throw error;
      return (data ?? []) as unknown as string[];
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change visit day</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Currently {fmt(visit.scheduled_date)}. Pick an available day — the company will confirm.</p>
        {days.isLoading ? <Spinner /> : !days.data?.length ? <p className="text-sm">No open days in the next 3 weeks. Send a note instead.</p> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{days.data.map((d) => (
            <button key={d} onClick={() => setPick(d)} className={`h-12 rounded-xl border text-sm font-semibold ${pick === d ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{fmt(d)}</button>))}</div>
        )}
        <Textarea placeholder="Optional note" maxLength={1000} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Button className="h-11 w-full" disabled={!pick || busy} onClick={() => onRequest(pick, msg)}>Request this day</Button>
      </DialogContent>
    </Dialog>
  );
}
