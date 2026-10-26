import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";

export const Route = createFileRoute("/_authenticated/app/")({ head: () => ({ meta: [{ title: "Dashboard | LawnOffice" }, { name: "description", content: "Landscaping business overview, upcoming visits and financial totals." }, { property: "og:title", content: "Dashboard | LawnOffice" }, { property: "og:description", content: "Landscaping business overview, upcoming visits and financial totals." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }), component: Dashboard });

const iso = (d: Date) => d.toISOString().slice(0, 10);

function Dashboard() {
  const { companyId, role, current } = useWorkspace();
  const today = iso(new Date());
  const monthStart = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const showMoney = can(role, "dashboard.financials");

  const q = useQuery({
    queryKey: ["dashboard", companyId, today],
    queryFn: async () => {
      const weekEnd = iso(new Date(Date.now() + 7 * 864e5));
      const [todayJobs, monthDone, customers, plans, payments, invoices, upcoming, todayCrew, recurringWeek, doneByCrew, recentMsgs, newCustomers] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("scheduled_date", today).neq("status", "cancelled"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "completed").gte("scheduled_date", monthStart),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("recurring_plans").select("price, frequency").eq("company_id", companyId).eq("active", true),
        supabase.from("payments").select("amount").eq("company_id", companyId).gte("paid_at", monthStart),
        supabase.from("invoices").select("total, amount_paid, status").eq("company_id", companyId).in("status", ["sent", "partial", "overdue"]),
        supabase.from("jobs").select("id, title, scheduled_date, status, customer:customers(name), crew:crews(name)").eq("company_id", companyId).gte("scheduled_date", today).neq("status", "cancelled").order("scheduled_date").limit(8),
        supabase.from("jobs").select("status, crew:crews(id, name, color)").eq("company_id", companyId).eq("scheduled_date", today).neq("status", "cancelled"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", companyId).not("recurring_plan_id", "is", null).gte("scheduled_date", today).lte("scheduled_date", weekEnd).neq("status", "cancelled"),
        supabase.from("jobs").select("price, crew:crews(id, name)").eq("company_id", companyId).eq("status", "completed").gte("scheduled_date", monthStart),
        supabase.from("messages").select("id, body, direction, created_at, customer:customers(name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", monthStart),
      ]);
      type CrewRef = { id: string; name: string; color?: string | null } | null;
      const crewToday = new Map<string, { name: string; total: number; done: number }>();
      for (const j of todayCrew.data ?? []) {
        const c = j.crew as CrewRef; const k = c?.id ?? "none";
        const e = crewToday.get(k) ?? { name: c?.name ?? "Unassigned", total: 0, done: 0 };
        e.total++; if (j.status === "completed") e.done++; crewToday.set(k, e);
      }
      const prod = new Map<string, { name: string; jobs: number; revenue: number }>();
      for (const j of doneByCrew.data ?? []) {
        const c = j.crew as CrewRef; const k = c?.id ?? "none";
        const e = prod.get(k) ?? { name: c?.name ?? "Unassigned", jobs: 0, revenue: 0 };
        e.jobs++; e.revenue += Number(j.price); prod.set(k, e);
      }
      const mrr = (plans.data ?? []).reduce((s, p) => s + Number(p.price) * (p.frequency === "weekly" ? 4.33 : p.frequency === "biweekly" ? 2.17 : 1), 0);
      return {
        todayJobs: todayJobs.count ?? 0,
        monthDone: monthDone.count ?? 0,
        customers: customers.count ?? 0,
        plans: plans.data?.length ?? 0,
        mrr,
        collected: (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
        outstanding: (invoices.data ?? []).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0),
        upcoming: upcoming.data ?? [],
        recurringWeek: recurringWeek.count ?? 0,
        newCustomers: newCustomers.count ?? 0,
        crewToday: [...crewToday.values()],
        productivity: [...prod.values()].sort((a, b) => b.jobs - a.jobs),
        activity: recentMsgs.data ?? [],
      };
    },
  });

  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const kpis = [
    { label: "Jobs today", value: d.todayJobs },
    { label: "Completed this month", value: d.monthDone },
    { label: "Active customers", value: d.customers },
    { label: "Recurring plans", value: d.plans },
    { label: "Recurring visits next 7 days", value: d.recurringWeek },
    { label: "New customers this month", value: d.newCustomers },
    ...(showMoney
      ? [
          { label: "Collected this month", value: money(d.collected) },
          { label: "Outstanding", value: money(d.outstanding) },
          { label: "Est. monthly recurring", value: money(d.mrr) },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title={`Good day, ${current?.company.name}`} subtitle={current?.company.subscription_status === "trialing" ? `Trial ends ${new Date(current.company.trial_ends_at).toLocaleDateString()}` : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <Card key={k.label} className={i === 0 ? "bg-forest text-forest-foreground" : ""}>
            <p className={`text-xs font-medium uppercase tracking-wide ${i === 0 ? "text-forest-foreground/70" : "text-muted-foreground"}`}>{k.label}</p>
            <p className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{k.value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-bold">Crews today</h2>
          {d.crewToday.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No crews scheduled today.</p>}
          <ul className="mt-2 space-y-2 text-sm">
            {d.crewToday.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-muted-foreground">{c.done}/{c.total} done</span></li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold">Crew productivity this month</h2>
          {d.productivity.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No completed visits yet.</p>}
          <ul className="mt-2 space-y-2 text-sm">
            {d.productivity.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-muted-foreground">{c.jobs} {c.jobs === 1 ? "visit" : "visits"}{showMoney ? ` · ${money(c.revenue)}` : ""}</span></li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold">Customer activity</h2>
          {d.activity.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No recent notes or messages.</p>}
          <ul className="mt-2 space-y-2 text-sm">
            {d.activity.map((m) => <li key={m.id} className="min-w-0"><p className="truncate"><span className="font-semibold">{(m.customer as { name: string } | null)?.name}</span> · {m.body}</p><p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p></li>)}
          </ul>
        </Card>
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Upcoming visits</h2>
        <Link to="/app/schedule" className="text-sm font-semibold text-primary">Open schedule →</Link>
      </div>
      <Card className="mt-3 divide-y p-0 sm:p-0">
        {d.upcoming.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nothing scheduled yet.</p>}
        {d.upcoming.map((j) => (
          <div key={j.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{j.title} · {(j.customer as { name: string } | null)?.name}</p>
              <p className="text-sm text-muted-foreground">{new Date(j.scheduled_date + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{j.crew ? ` · ${(j.crew as { name: string }).name}` : ""}</p>
            </div>
            <StatusBadge status={j.status} />
          </div>
        ))}
      </Card>
    </>
  );
}
