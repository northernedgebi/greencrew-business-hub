import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Card, Empty, PageHeader, Spinner } from "@/components/app-ui";
import { Logo, PLANS } from "@/components/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { planPrice, platformStats } from "@/lib/admin-stats";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Platform admin — LawnOffice" }, { name: "description", content: "Manage LawnOffice companies, subscriptions and platform revenue." }, { property: "og:title", content: "Platform admin — LawnOffice" }, { property: "og:description", content: "LawnOffice platform administration." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

const sel = "h-10 rounded-xl border bg-background px-2 text-sm";
const STATUSES = ["trialing", "active", "past_due", "cancelled", "suspended"] as const;
const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Admin() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const q = useQuery({
    queryKey: ["admin-companies"],
    enabled: ws.isSuperAdmin,
    queryFn: async () => {
      const [companies, members, customers, jobs, profiles] = await Promise.all([
        supabase.from("companies").select("*").order("created_at", { ascending: false }),
        supabase.from("company_members").select("company_id, user_id, role"),
        supabase.from("customers").select("company_id"),
        supabase.from("jobs").select("company_id"),
        supabase.from("profiles").select("id, email, full_name"),
      ]);
      const count = (rows: { company_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.company_id === id).length;
      const owners = new Map((members.data ?? []).filter((m) => m.role === "owner").map((m) => [m.company_id, m.user_id]));
      const prof = new Map((profiles.data ?? []).map((p) => [p.id, p]));
      return (companies.data ?? []).map((c) => ({ ...c, users: count(members.data, c.id), customers: count(customers.data, c.id), jobs: count(jobs.data, c.id), owner: prof.get(owners.get(c.id) ?? "") ?? null }));
    },
  });

  const stats = useMemo(() => platformStats(q.data ?? []), [q.data]);
  const list = (q.data ?? []).filter((c) => (filter === "all" || c.subscription_status === filter) && `${c.name} ${c.email ?? ""} ${c.owner?.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  async function update(id: string, patch: { subscription_status?: string; plan?: string; trial_ends_at?: string }, msg: string) {
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["admin-companies"] });
  }

  if (ws.loading) return <Spinner />;
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between bg-forest px-4"><Logo light /><Link to="/app" className="text-sm font-semibold text-forest-foreground">Back to app</Link></header>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        {!ws.isSuperAdmin ? <Empty title="Restricted" text="This area is for platform administrators." /> : q.isLoading ? <Spinner /> : (
          <>
            <PageHeader title="Platform admin" subtitle="Companies, subscriptions and revenue" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {([
                ["Monthly revenue (MRR)", usd(stats.mrr), "Paying companies"],
                ["Yearly run rate", usd(stats.mrr * 12), "MRR × 12"],
                ["Trial pipeline", usd(stats.trialMrr), `${stats.byStatus["trialing"] ?? 0} trialing`],
                ["New this month", String(stats.newThisMonth), `${stats.newLast30} in last 30 days`],
                ["Companies", String(stats.total), `${stats.byStatus["active"] ?? 0} active`],
                ["Disabled", String(stats.byStatus["suspended"] ?? 0), `${stats.byStatus["cancelled"] ?? 0} cancelled`],
                ["Trials ending ≤ 7 days", String(stats.trialsEndingSoon), "Follow up to convert"],
                ["Users", String(stats.users), `${stats.customers} customers managed`],
              ] as const).map(([l, v, s]) => (
                <Card key={l}><p className="text-xs uppercase text-muted-foreground">{l}</p><p className="font-display text-2xl font-extrabold sm:text-3xl">{v}</p><p className="text-xs text-muted-foreground">{s}</p></Card>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <h2 className="mb-3 font-bold">Revenue by plan</h2>
                {PLANS.map((p) => { const n = stats.activeByPlan[p.id] ?? 0; return (
                  <div key={p.id} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{p.name} · {usd(p.price)}/mo</span><span className="font-semibold">{n} paying · {usd(n * p.price)}</span></div>
                ); })}
              </Card>
              <Card>
                <h2 className="mb-3 font-bold">Signups (last 6 months)</h2>
                <div className="flex h-32 items-end gap-2">
                  {stats.signups.map((m) => (
                    <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-xs font-semibold">{m.count}</span>
                      <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(4, (m.count / Math.max(1, ...stats.signups.map((x) => x.count))) * 90)}px` }} />
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="mt-4 !p-0">
              <div className="flex flex-wrap gap-2 border-b p-3">
                <Input className="h-10 max-w-xs" placeholder="Search company or email" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select aria-label="Status filter" className={sel} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
              </div>
              <div className="divide-y">
                {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">No companies match.</p>}
                {list.map((c) => (
                  <div key={c.id} className="flex flex-col gap-3 p-4 text-sm lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">{c.name}<span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${c.subscription_status === "suspended" ? "bg-destructive/15 text-destructive" : c.subscription_status === "active" ? "bg-success/15 text-primary" : "bg-secondary"}`}>{c.subscription_status === "suspended" ? "disabled" : c.subscription_status.replace("_", " ")}</span></p>
                      <p className="text-muted-foreground">{c.owner?.full_name ?? "Owner"} · {c.owner?.email ?? c.email ?? "no email"}{c.phone ? ` · ${c.phone}` : ""}</p>
                      <p className="text-xs text-muted-foreground">Joined {new Date(c.created_at).toLocaleDateString()} · {c.users} users · {c.customers} customers · {c.jobs} visits{c.subscription_status === "trialing" ? ` · trial ends ${new Date(c.trial_ends_at).toLocaleDateString()}` : ""} · {usd(planPrice(c.plan))}/mo</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select aria-label={`Plan for ${c.name}`} className={sel} value={c.plan} onChange={(e) => update(c.id, { plan: e.target.value }, "Plan updated")}>{PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                      <select aria-label={`Status for ${c.name}`} className={sel} value={c.subscription_status} onChange={(e) => update(c.id, { subscription_status: e.target.value }, "Status updated")}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
                      <TrialExtender onExtend={(days) => { const d = new Date(Math.max(Date.now(), new Date(c.trial_ends_at).getTime())); d.setDate(d.getDate() + days); void update(c.id, { trial_ends_at: d.toISOString() }, `Trial extended ${days} days`); }} />
                      {c.subscription_status === "suspended"
                        ? <Button size="sm" className="h-10" onClick={() => update(c.id, { subscription_status: "active" }, `${c.name} re-enabled`)}>Enable</Button>
                        : <Button size="sm" variant="destructive" className="h-10" onClick={() => confirm(`Disable ${c.name}? Their team will be locked out until re-enabled.`) && update(c.id, { subscription_status: "suspended" }, `${c.name} disabled`)}>Disable</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
