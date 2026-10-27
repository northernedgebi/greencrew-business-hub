import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, Mail, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerServices } from "@/components/customer-services";
import { StormVisits } from "@/components/storm-visits";
import { customerYearTotals } from "@/lib/customer-services";
import { localDate } from "@/lib/scheduling";
import { billGroups, billLineDescription, type BillingMode } from "@/lib/billing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerAccountControls } from "@/components/customer-account-controls";
import { DeleteRecord } from "@/components/delete-record";

export const Route = createFileRoute("/_authenticated/app/customers/$id")({ component: CustomerDetail, head: () => ({ meta: [{ title: "Customer Services & Visits | LawnOffice" }, { name: "description", content: "Manage a customer’s services, recurring tasks, visits and invoices." }, { property: "og:title", content: "Customer Services & Visits | LawnOffice" }, { property: "og:description", content: "Landscaping customer services, visits and billing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

function CustomerDetail() {
  const { id } = Route.useParams();
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const manage = can(role, "customers.manage");
  const key = ["customer", id];

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const [c, props, jobs, invoices, notes, account, plans, yearJobs, unbilledJobs] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("properties").select("*").eq("customer_id", id).order("created_at"),
        supabase.from("jobs").select("id, title, scheduled_date, status, price").eq("customer_id", id).order("scheduled_date", { ascending: false }).limit(20),
        supabase.from("invoices").select("id, number, total, amount_paid, status, issue_date").eq("customer_id", id).order("issue_date", { ascending: false }),
        supabase.from("messages").select("id, body, created_at, channel").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.rpc("customer_account_state", { _customer: id }),
        supabase.from("recurring_plans").select("service, frequency, price, times_per_year, active").eq("company_id", companyId).eq("customer_id", id).eq("active", true),
        supabase.from("jobs").select("price").eq("company_id", companyId).eq("customer_id", id).is("recurring_plan_id", null).neq("status", "cancelled").gte("scheduled_date", yearStart),
        supabase.from("jobs").select("id, title, scheduled_date, price, property_id, property:properties(address)").eq("company_id", companyId).eq("customer_id", id).eq("status", "completed").is("invoice_id", null).order("scheduled_date"),
      ]);
      if (c.error) throw c.error;
      if (account.error) throw account.error;
      const invoiceIds = (invoices.data ?? []).filter((i) => i.status !== "void").map((i) => i.id);
      const payments = invoiceIds.length
        ? await supabase.from("payments").select("amount").in("invoice_id", invoiceIds).gte("paid_at", yearStart)
        : { data: [] as { amount: number }[], error: null };
      if (payments.error) throw payments.error;
      const unbilled = (unbilledJobs.data ?? []).map((j) => ({ id: j.id, title: j.title, scheduled_date: j.scheduled_date, price: Number(j.price), property_id: j.property_id, address: (j.property as { address: string } | null)?.address ?? null }));
      return { c: c.data, account: account.data?.[0], props: props.data ?? [], jobs: jobs.data ?? [], invoices: invoices.data ?? [], notes: notes.data ?? [], plans: plans.data ?? [], yearJobs: yearJobs.data ?? [], payments: payments.data ?? [], unbilled };
    },
    refetchInterval: 60000,
  });

  const [addr, setAddr] = useState({ address: "", city: "", zip: "", gate_code: "" });
  const [note, setNote] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const addProp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").insert({ company_id: companyId, customer_id: id, address: addr.address, city: addr.city || null, zip: addr.zip || null, gate_code: addr.gate_code || null });
      if (error) throw error;
    },
    onSuccess: () => { setAddr({ address: "", city: "", zip: "", gate_code: "" }); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("messages").insert({ company_id: companyId, customer_id: id, body: note, channel: "note" });
      if (error) throw error;
    },
    onSuccess: () => { setNote(""); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const saveBillingMode = useMutation({
    mutationFn: async (mode: BillingMode) => {
      const { error } = await supabase.from("customers").update({ billing_mode: mode }).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Billing preference saved"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const billVisits = useMutation({
    mutationFn: async () => {
      const data = q.data;
      if (!data) return;
      const mode = (data.c.billing_mode ?? "combined") as BillingMode;
      const groups = billGroups(data.unbilled, mode);
      for (const g of groups) {
        const inv = await supabase.from("invoices").insert({ company_id: companyId, customer_id: id, status: "sent" }).select("id").single();
        if (inv.error) throw inv.error;
        const items = g.visits.map((v) => ({ company_id: companyId, invoice_id: inv.data.id, description: billLineDescription(v, mode), quantity: 1, unit_price: v.price, job_id: v.id }));
        const it = await supabase.from("invoice_items").insert(items);
        if (it.error) throw it.error;
        const link = await supabase.from("jobs").update({ invoice_id: inv.data.id }).in("id", g.visits.map((v) => v.id));
        if (link.error) throw link.error;
      }
      return groups.length;
    },
    onSuccess: (n) => { toast.success(n === 1 ? "Bill created" : `${n} bills created, one per address`); refresh(); qc.invalidateQueries({ queryKey: ["invoices", companyId] }); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading || !q.data) return <Spinner />;
  const { c, account, props, jobs, invoices, notes, plans, yearJobs, payments, unbilled } = q.data;
  const balance = invoices.filter((i) => i.status !== "void" && i.status !== "draft").reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);
  const year = new Date().getFullYear();
  const totals = customerYearTotals(plans, yearJobs, payments);
  const seeMoney = can(role, "billing.manage") || role === "read_only";

  return (
    <>
      <Link to="/app/customers" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"><ArrowLeft className="h-4 w-4" />Customers</Link>
      <PageHeader title={c.name} action={<div className="flex items-center gap-2">{c.customer_type === "commercial" && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Commercial</span>}<StatusBadge status={account?.effective_status ?? c.status} />{manage && <DeleteRecord table="customers" id={id} name={c.name} description="This customer and all their properties, services, visits, estimates, contracts, notes, requests, invoices, and payment records will be permanently removed." onDeleted={() => navigate({ to: "/app/customers" })} />}</div>} />
      {account?.inactivity_reason && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive"><p className="font-semibold">{account.inactivity_reason}</p><p className="text-sm">{account.effective_status === "on_hold" ? `${money(account.overdue_balance)} overdue. Service is on hold until the overdue balance meets the billing rule.` : "Service is inactive until your office reactivates this customer."}</p></div>}
      {seeMoney && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">All services per year</p><p className="font-display text-2xl font-extrabold">{money(totals.yearlyServices)}</p><p className="text-xs text-muted-foreground">Active services + this year's one-time work</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid in {year}</p><p className="font-display text-2xl font-extrabold text-primary">{money(totals.paidThisYear)}</p><p className="text-xs text-muted-foreground">Payments received since Jan 1</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Left for {year}</p><p className="font-display text-2xl font-extrabold">{money(totals.leftForYear)}</p><p className="text-xs text-muted-foreground">Yearly services minus what's been paid</p></div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 font-medium"><Phone className="h-4 w-4 text-primary" />{c.phone}</a>}
          <p className="text-xs text-muted-foreground">{c.portal_user_id ? "Customer portal: connected" : c.email ? "Customer portal: they can sign up with this email to see visits and bills" : "Add an email so this customer can use the portal"}</p>
          {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all font-medium"><Mail className="h-4 w-4 text-primary" />{c.email}</a>}
          {c.customer_type === "commercial" && c.ein && <p className="text-sm text-muted-foreground">EIN: {c.ein}</p>}
          <div className="rounded-xl bg-secondary p-3"><p className="text-xs uppercase text-muted-foreground">Open balance</p><p className="font-display text-2xl font-extrabold">{money(balance)}</p></div>
          {manage && <CustomerAccountControls key={`${c.status}-${c.inactive_reason}-${c.overdue_hold_limit}`} customer={c} />}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-bold">Properties</h2>
          <div className="space-y-2">
            {props.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-xl border p-3">
                <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1 text-sm">
                  <a className="font-semibold" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent([p.address, p.city, p.zip].filter(Boolean).join(", "))}`}>{p.address}</a>
                  <p className="text-muted-foreground">{[p.city, p.state, p.zip].filter(Boolean).join(", ")}{p.gate_code ? ` · Gate ${p.gate_code}` : ""}</p>
                </div>
                {manage && <DeleteRecord table="properties" id={p.id} name={p.address} description="This property and its recurring plans will be removed. Existing visits and estimates stay without a property address." />}
              </div>
            ))}
          </div>
          {manage && (
            <form className="mt-3 grid gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); addProp.mutate(); }}>
              <Input className="h-11 sm:col-span-2" placeholder="Address" required value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} />
              <Input className="h-11" placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <Input className="h-11" placeholder="Gate code" value={addr.gate_code} onChange={(e) => setAddr({ ...addr, gate_code: e.target.value })} />
              <Button type="submit" variant="secondary"><Plus />Add</Button>
            </form>
          )}
        </Card>
        {manage && (
          <Card className="lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">Billing</h2>
              <Select value={c.billing_mode ?? "combined"} onValueChange={(v) => saveBillingMode.mutate(v as BillingMode)}>
                <SelectTrigger className="h-11 w-full sm:w-80"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">One bill, broken out by address</SelectItem>
                  <SelectItem value="per_property">Separate bill for each address</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {unbilled.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No completed visits waiting to be billed.</p>
            ) : (
              <>
                <div className="mt-3 divide-y rounded-xl border">
                  {unbilled.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate"><span className="font-medium">{v.title}</span> <span className="text-muted-foreground">· {v.scheduled_date}{v.address ? ` · ${v.address}` : ""}</span></span>
                      <span className="shrink-0 tabular-nums">{money(v.price)}</span>
                    </div>
                  ))}
                </div>
                <Button className="mt-3" disabled={billVisits.isPending} onClick={() => billVisits.mutate()}>
                  {billGroups(unbilled, (c.billing_mode ?? "combined") as BillingMode).length > 1 ? `Create ${billGroups(unbilled, (c.billing_mode ?? "combined") as BillingMode).length} bills (one per address)` : "Create bill"} · {money(unbilled.reduce((s, v) => s + v.price, 0))}
                </Button>
              </>
            )}
          </Card>
        )}
        <Card className="lg:col-span-2">
          <CustomerServices customerId={id} properties={props} />
          <StormVisits customerId={id} properties={props} />
          <h2 className="mb-3 font-bold">Recent jobs</h2>
          {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No jobs yet.</p> : (
            <div className="divide-y">{jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between py-2.5 text-sm">
                <span><span className="font-medium">{j.title}</span> <span className="text-muted-foreground">· {j.scheduled_date}</span></span>
                <span className="flex items-center gap-2">{money(j.price)}<StatusBadge status={j.status} /></span>
              </div>))}
            </div>
          )}
          <h2 className="mb-3 mt-6 font-bold">Invoices</h2>
          {invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : (
            <div className="divide-y">{invoices.map((i) => (
              <Link key={i.id} to="/app/invoices/$id" params={{ id: i.id }} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">#{i.number} <span className="text-muted-foreground">· {i.issue_date}</span></span>
                <span className="flex items-center gap-2">{money(i.total)}<StatusBadge status={i.status} /></span>
              </Link>))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Notes & communication</h2>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a call, note, or request…" />
            <Button type="submit" size="sm" className="w-full">Add note</Button>
          </form>
          <div className="mt-4 space-y-3">{notes.map((n) => (
            <div key={n.id} className="rounded-lg bg-muted p-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>
          ))}</div>
        </Card>
      </div>
    </>
  );
}
