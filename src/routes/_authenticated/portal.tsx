import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Logo } from "@/components/marketing";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({ meta: [{ title: "Customer portal — LawnOffice" }, { name: "robots", content: "noindex" }] }),
  component: Portal,
});

function Portal() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["portal", ws.userId],
    enabled: !!ws.userId,
    queryFn: async () => {
      const me = (await supabase.from("customers").select("id, name").eq("portal_user_id", ws.userId)).data ?? [];
      const ids = me.map((c) => c.id);
      if (!ids.length) return { me, jobs: [], invoices: [] };
      const today = new Date().toISOString().slice(0, 10);
      const [jobs, invoices] = await Promise.all([
        supabase.from("jobs").select("id, title, scheduled_date, status").in("customer_id", ids).gte("scheduled_date", today).order("scheduled_date").limit(10),
        supabase.from("invoices").select("id, number, total, amount_paid, status, due_date").in("customer_id", ids).neq("status", "draft").order("issue_date", { ascending: false }),
      ]);
      return { me, jobs: jobs.data ?? [], invoices: invoices.data ?? [] };
    },
  });
  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between bg-forest px-4"><Logo light /><Button variant="heroOutline" size="sm" onClick={signOut}>Sign out</Button></header>
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        {q.isLoading || !q.data ? <Spinner /> : q.data.me.length === 0 ? <Empty title="No account linked" text="Ask your landscaping company to connect your account." /> : (
          <>
            <PageHeader title={`Hi, ${q.data.me[0].name}`} />
            <h2 className="mb-2 font-bold">Upcoming visits</h2>
            <Card className="divide-y p-0 sm:p-0">{q.data.jobs.length === 0 ? <p className="p-4 text-sm text-muted-foreground">None scheduled.</p> : q.data.jobs.map((j) => (
              <div key={j.id} className="flex justify-between p-4 text-sm"><span className="font-medium">{j.title} · {j.scheduled_date}</span><StatusBadge status={j.status} /></div>))}</Card>
            <h2 className="mb-2 mt-6 font-bold">Invoices</h2>
            <Card className="divide-y p-0 sm:p-0">{q.data.invoices.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No invoices.</p> : q.data.invoices.map((i) => (
              <div key={i.id} className="flex justify-between p-4 text-sm"><span className="font-medium">#{i.number} · due {i.due_date}</span><span className="flex items-center gap-2">{money(Number(i.total) - Number(i.amount_paid))}<StatusBadge status={i.status} /></span></div>))}</Card>
          </>
        )}
      </main>
    </div>
  );
}
