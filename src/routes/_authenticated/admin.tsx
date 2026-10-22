import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Card, Empty, PageHeader, Spinner } from "@/components/app-ui";
import { Logo } from "@/components/marketing";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Platform admin — LawnOffice" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

function Admin() {
  const ws = useWorkspace();
  const q = useQuery({
    queryKey: ["admin-companies"],
    enabled: ws.isSuperAdmin,
    queryFn: async () => {
      const [companies, members, customers] = await Promise.all([
        supabase.from("companies").select("*").order("created_at", { ascending: false }),
        supabase.from("company_members").select("company_id"),
        supabase.from("customers").select("company_id"),
      ]);
      const count = (rows: { company_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.company_id === id).length;
      return (companies.data ?? []).map((c) => ({ ...c, users: count(members.data, c.id), customers: count(customers.data, c.id) }));
    },
  });
  if (ws.loading) return <Spinner />;
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between bg-forest px-4"><Logo light /><Link to="/app" className="text-sm font-semibold text-forest-foreground">Back to app</Link></header>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        {!ws.isSuperAdmin ? <Empty title="Restricted" text="This area is for platform administrators." /> : (
          <>
            <PageHeader title="Platform admin" subtitle={`${q.data?.length ?? 0} companies`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Companies", q.data?.length ?? 0], ["Trialing", q.data?.filter((c) => c.subscription_status === "trialing").length ?? 0], ["Active", q.data?.filter((c) => c.subscription_status === "active").length ?? 0], ["Users", q.data?.reduce((s, c) => s + c.users, 0) ?? 0]].map(([l, v]) => (
                <Card key={l as string}><p className="text-xs uppercase text-muted-foreground">{l}</p><p className="font-display text-3xl font-extrabold">{v}</p></Card>
              ))}
            </div>
            <Card className="mt-4 divide-y p-0 sm:p-0">
              {q.data?.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <div><p className="font-semibold">{c.name}</p><p className="text-muted-foreground">Created {new Date(c.created_at).toLocaleDateString()}</p></div>
                  <p className="text-muted-foreground"><span className="capitalize">{c.plan}</span> · <span className="capitalize">{c.subscription_status}</span> · {c.users} users · {c.customers} customers</p>
                </div>
              ))}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
