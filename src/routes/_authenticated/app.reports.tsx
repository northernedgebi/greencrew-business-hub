import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { money, useWorkspace } from "@/lib/workspace";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader, Spinner } from "@/components/app-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Reports | LawnOffice" }, { name: "description", content: "Review landscaping revenue, completed work and outstanding invoices." }, { property: "og:title", content: "Reports | LawnOffice" }, { property: "og:description", content: "Review landscaping revenue, completed work and outstanding invoices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Reports,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

type JobRow = { status: string; price: number; scheduled_date: string; title: string; service_kind: string; customer: { id: string; name: string; customer_type: string } | null };
type PayRow = { amount: number; paid_at: string; invoice: { customer: { customer_type: string } | null } | null };

function Reports() {
  const { companyId } = useWorkspace();
  const [months, setMonths] = useState(6);
  const start = iso(new Date(new Date().getFullYear(), new Date().getMonth() - months + 1, 1));
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const q = useQuery({
    queryKey: ["reports", companyId, start],
    queryFn: async () => {
      const [pay, payAll, jobs, inv] = await Promise.all([
        supabase.from("payments").select("amount, paid_at, invoice:invoices(customer:customers(customer_type))").eq("company_id", companyId).gte("paid_at", start),
        supabase.from("payments").select("amount, paid_at").eq("company_id", companyId),
        supabase.from("jobs").select("status, price, scheduled_date, title, service_kind, customer:customers(id, name, customer_type)").eq("company_id", companyId).gte("scheduled_date", start),
        supabase.from("invoices").select("total, amount_paid, due_date, status").eq("company_id", companyId).in("status", ["sent", "partial", "overdue"]),
      ]);
      const byMonth = new Map<string, { collected: number; billed: number; visits: number }>();
      for (let i = 0; i < months; i++) {
        const d = new Date(new Date().getFullYear(), new Date().getMonth() - months + 1 + i, 1);
        byMonth.set(iso(d).slice(0, 7), { collected: 0, billed: 0, visits: 0 });
      }
      const paidByType = { residential: 0, commercial: 0 };
      let collected = 0;
      for (const p of (pay.data ?? []) as PayRow[]) {
        const m = byMonth.get(p.paid_at.slice(0, 7)); if (m) m.collected += Number(p.amount);
        collected += Number(p.amount);
        const t = p.invoice?.customer?.customer_type === "commercial" ? "commercial" : "residential";
        paidByType[t] += Number(p.amount);
      }
      const byYear = new Map<string, number>();
      let collectedThisYear = 0;
      let collectedAllTime = 0;
      for (const p of payAll.data ?? []) {
        const y = p.paid_at.slice(0, 4);
        byYear.set(y, (byYear.get(y) ?? 0) + Number(p.amount));
        collectedAllTime += Number(p.amount);
        if (p.paid_at >= yearStart) collectedThisYear += Number(p.amount);
      }
      const status: Record<string, number> = {};
      const custs = new Map<string, { name: string; revenue: number; visits: number }>();
      const workByType = { residential: { revenue: 0, visits: 0 }, commercial: { revenue: 0, visits: 0 } };
      const byService = new Map<string, { revenue: number; visits: number }>();
      let completed = 0;
      for (const j of (jobs.data ?? []) as JobRow[]) {
        status[j.status] = (status[j.status] ?? 0) + 1;
        if (j.status !== "completed") continue;
        completed += Number(j.price);
        const m = byMonth.get(j.scheduled_date.slice(0, 7)); if (m) { m.billed += Number(j.price); m.visits++; }
        const c = j.customer;
        if (c) { const e = custs.get(c.id) ?? { name: c.name, revenue: 0, visits: 0 }; e.revenue += Number(j.price); e.visits++; custs.set(c.id, e); }
        const t = c?.customer_type === "commercial" ? "commercial" : "residential";
        workByType[t].revenue += Number(j.price); workByType[t].visits++;
        const s = byService.get(j.title) ?? { revenue: 0, visits: 0 };
        s.revenue += Number(j.price); s.visits++; byService.set(j.title, s);
      }
      const today = iso(new Date());
      const aging = { current: 0, "1–30 days": 0, "31–60 days": 0, "60+ days": 0 } as Record<string, number>;
      for (const i of inv.data ?? []) {
        const due = Number(i.total) - Number(i.amount_paid);
        const late = Math.floor((Date.parse(today) - Date.parse(i.due_date)) / 864e5);
        const k = late <= 0 ? "current" : late <= 30 ? "1–30 days" : late <= 60 ? "31–60 days" : "60+ days";
        aging[k] = (aging[k] ?? 0) + due;
      }
      const outstanding = Object.values(aging).reduce((s, v) => s + v, 0);
      return {
        months: [...byMonth.entries()], status, aging, outstanding, collected, completed, collectedThisYear, collectedAllTime,
        paidByType, workByType,
        byYear: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])),
        byService: [...byService.entries()].sort((a, b) => b[1].revenue - a[1].revenue),
        top: [...custs.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      };
    },
  });
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const max = Math.max(1, ...d.months.map(([, m]) => Math.max(m.collected, m.billed)));
  const typeMax = Math.max(1, d.workByType.residential.revenue, d.workByType.commercial.revenue);
  const svcMax = Math.max(1, ...d.byService.map(([, s]) => s.revenue));
  return (
    <>
      <PageHeader title="Reports" subtitle="Revenue, work completed and money owed" action={
        <div className="flex gap-2">{[3, 6, 12].map((n) => <Button key={n} size="sm" variant={months === n ? "default" : "outline"} onClick={() => setMonths(n)}>{n} months</Button>)}</div>
      } />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collected · {months} mo</p><p className="font-display text-2xl font-extrabold">{money(d.collected)}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work done · {months} mo</p><p className="font-display text-2xl font-extrabold">{money(d.completed)}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid in {new Date().getFullYear()}</p><p className="font-display text-2xl font-extrabold text-primary">{money(d.collectedThisYear)}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Still owed</p><p className="font-display text-2xl font-extrabold">{money(d.outstanding)}</p></Card>
      </div>
      <Card>
        <h2 className="font-bold">Monthly revenue</h2>
        <p className="text-xs text-muted-foreground">Dark bar: completed work · light bar: payments collected</p>
        <div className="mt-4 space-y-3">
          {d.months.map(([k, m]) => (
            <div key={k} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{new Date(k + "-01T00:00").toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</span>
              <div className="space-y-1">
                <div className="h-2.5 rounded-full bg-primary" style={{ width: `${(m.billed / max) * 100}%` }} />
                <div className="h-2.5 rounded-full bg-accent" style={{ width: `${(m.collected / max) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums">{money(m.billed)}<br /><span className="text-muted-foreground">{money(m.collected)}</span></span>
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Commercial vs residential</h2>
          <p className="text-xs text-muted-foreground">Completed work and payments collected in this period</p>
          <div className="mt-4 space-y-4">
            {(["residential", "commercial"] as const).map((t) => (
              <div key={t}>
                <div className="flex justify-between text-sm"><span className="font-semibold capitalize">{t}</span><span className="tabular-nums">{money(d.workByType[t].revenue)} · {d.workByType[t].visits} visits</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-primary" style={{ width: `${(d.workByType[t].revenue / typeMax) * 100}%` }} />
                <p className="mt-1 text-xs text-muted-foreground">Collected: {money(d.paidByType[t])}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-bold">Revenue by service</h2>
          <p className="text-xs text-muted-foreground">Completed visits in this period, grouped by task</p>
          <div className="mt-4 space-y-3">
            {d.byService.length === 0 ? <p className="text-sm text-muted-foreground">No completed work yet.</p> : d.byService.map(([name, s]) => (
              <div key={name}>
                <div className="flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{name}</span><span className="tabular-nums">{money(s.revenue)} · {s.visits}×</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-accent" style={{ width: `${(s.revenue / svcMax) * 100}%` }} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Card>
          <h2 className="font-bold">Paid by year</h2>
          <ul className="mt-2 space-y-2 text-sm">{d.byYear.length === 0 ? <li className="text-muted-foreground">No payments yet.</li> : d.byYear.map(([y, v]) => <li key={y} className="flex justify-between"><span>{y}</span><span className="tabular-nums">{money(v)}</span></li>)}</ul>
          <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">All time: {money(d.collectedAllTime)}</p>
        </Card>
        <Card>
          <h2 className="font-bold">Unpaid invoices by age</h2>
          <ul className="mt-2 space-y-2 text-sm">{Object.entries(d.aging).map(([k, v]) => <li key={k} className="flex justify-between capitalize"><span>{k}</span><span className="tabular-nums">{money(v)}</span></li>)}</ul>
        </Card>
        <Card>
          <h2 className="font-bold">Visits by status</h2>
          <ul className="mt-2 space-y-2 text-sm">{Object.keys(d.status).length === 0 ? <li className="text-muted-foreground">No visits in this period.</li> : Object.entries(d.status).map(([k, v]) => <li key={k} className="flex justify-between capitalize"><span>{k.replace("_", " ")}</span><span>{v}</span></li>)}</ul>
        </Card>
        <Card>
          <h2 className="font-bold">Top customers</h2>
          <ul className="mt-2 space-y-2 text-sm">{d.top.length === 0 ? <li className="text-muted-foreground">No completed work yet.</li> : d.top.map((c) => <li key={c.name} className="flex justify-between gap-2"><span className="truncate">{c.name}</span><span className="tabular-nums text-muted-foreground">{money(c.revenue)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
