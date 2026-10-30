import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { useCustomerOptions } from "./app.schedule";
import { SnowReviewQueue } from "@/components/snow-review-queue";

export const Route = createFileRoute("/_authenticated/app/invoices/")({ head: () => ({ meta: [{ title: "Invoices | LawnOffice" }, { name: "description", content: "Track landscaping invoices, outstanding balances and payments." }, { property: "og:title", content: "Invoices | LawnOffice" }, { property: "og:description", content: "Track landscaping invoices, outstanding balances and payments." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }), component: Invoices });

const FILTERS = ["all", "draft", "sent", "partial", "paid"] as const;

function Invoices() {
  const { companyId } = useWorkspace();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [cust, setCust] = useState("");
  const customers = useCustomerOptions(companyId);
  const q = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => (await supabase.from("invoices").select("id, number, status, total, amount_paid, issue_date, due_date, customer:customers(name)").eq("company_id", companyId).order("number", { ascending: false })).data ?? [],
  });
  const today = new Date().toISOString().slice(0, 10);
  const list = (q.data ?? []).filter((i) => filter === "all" || i.status === filter);

  async function create() {
    if (!cust) return toast.error("Choose a customer");
    const { data, error } = await supabase.from("invoices").insert({ company_id: companyId, customer_id: cust }).select("id").single();
    if (error) return toast.error(error.message);
    navigate({ to: "/app/invoices/$id", params: { id: data.id } });
  }

  return (
    <>
      <PageHeader title="Invoices" action={
        <div className="flex gap-2">
          <select className="h-11 rounded-md border border-input bg-background px-3 text-sm md:h-10" value={cust} onChange={(e) => setCust(e.target.value)}>
            <option value="">Customer…</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button onClick={create}><Plus />New</Button>
        </div>} />
      <SnowReviewQueue />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium capitalize ${filter === f ? "border-primary bg-secondary" : "bg-card"}`}>{f}</button>)}
      </div>
      {q.isLoading ? <Spinner /> : list.length === 0 ? <Empty title="No invoices" text="Invoice completed jobs from the schedule, or create one here." /> : (
        <Card className="divide-y p-0 sm:p-0">
          {list.map((i) => {
            const overdue = (i.status === "sent" || i.status === "partial") && i.due_date < today;
            return (
              <Link key={i.id} to="/app/invoices/$id" params={{ id: i.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <div className="min-w-0"><p className="truncate font-semibold">#{i.number} · {i.customer?.name}</p><p className="text-sm text-muted-foreground">Due {i.due_date}</p></div>
                <div className="text-right"><p className="font-bold">{money(i.total)}</p><StatusBadge status={overdue ? "overdue" : i.status} /></div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
