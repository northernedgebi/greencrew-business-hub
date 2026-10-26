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

function Reports() {
  const { companyId } = useWorkspace();
  const [months, setMonths] = useState(6);
  const start = iso(new Date(new Date().getFullYear(), new Date().getMonth() - months + 1, 1));
  const q = useQuery({
    queryKey: ["reports", companyId, start],
    queryFn: async () => {
      const [pay, jobs, inv] = await Promise.all([
        supabase.from("payments").select("amount, paid_at").eq("company_id", companyId).gte("paid_at", start),
        supabase.from("jobs").select("status, price, scheduled_date, customer:customers(id, name)").eq("company_id", companyId).gte("scheduled_date", start),
        supabase.from("invoices").select("total, amount_paid, due_date, status").eq("company_id", companyId).in("status", ["sent", "partial", "overdue"]),
      ]);
      const byMonth = new Map<string, { collected: number; billed: number; visits: number }>();
      for (let i = 0; i < months; i++) {
        const d = new Date(new Date().getFullYear(), new Date().getMonth() - months + 1 + i, 1);
        byMonth.set(iso(d).slice(0, 7), { collected: 0, billed: 0, visits: 0 });
      }
      for (const p of pay.data ?? []) { const m = byMonth.get(p.paid_at.slice(0, 7)); if (m) m.collected += Number(p.amount); }
      const status: Record<string, number> = {};
      const custs = new Map<string, { name: string; revenue: number; visits: number }>();
      for (const j of jobs.data ?? []) {
        status[j.status] = (status[j.status] ?? 0) + 1;
        if (j.status !== "completed") continue;
        const m = byMonth.get(j.scheduled_date.slice(0, 7)); if (m) { m.billed += Number(j.price); m.visits++; }
        const c = j.customer as { id: string; name: string } | null;
        if (c) { const e = custs.get(c.id) ?? { name: c.name, revenue: 0, visits: 0 }; e.revenue += Number(j.price); e.visits++; custs.set(c.id, e); }
      }
      const today = iso(new Date());
      const aging = { current: 0, "1–30 days": 0, "31–60 days": 0, "60+ days": 0 } as Record<string, number>;
      for (const i of inv.data ?? []) {
        const due = Number(i.total) - Number(i.amount_paid);
        const late = Math.floor((Date.parse(today) - Date.parse(i.due_date)) / 864e5);
        const k = late <= 0 ? "current" : late <= 30 ? "1–30 days" : late <= 60 ? "31–60 days" : "60+ days";
        aging[k] = (aging[k] ?? 0) + due;
      }
      return { months: [...byMonth.entries()], status, top: [...custs.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8), aging };
    },
  });
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const max = Math.max(1, ...d.months.map(([, m]) => Math.max(m.collected, m.billed)));
  return (
    <>
      <PageHeader title="Reports" subtitle="Revenue, work completed and money owed" action={
        <div className="flex gap-2">{[3, 6, 12].map((n) => <Button key={n} size="sm" variant={months === n ? "default" : "outline"} onClick={() => setMonths(n)}>{n} months</Button>)}</div>
      } />
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
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
