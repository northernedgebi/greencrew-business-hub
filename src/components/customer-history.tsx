import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import type { Json } from "@/integrations/supabase/types";

const fields: Record<string, string> = { status: "Status", inactive_reason: "Reason", overdue_hold_limit: "Overdue limit", overdue_balance: "Overdue balance", service: "Service", title: "Task", price: "Price", frequency: "Repeat", pricing_mode: "Pricing", minimum_hours: "Minimum hours", worked_hours: "Hours worked", hourly_rate: "Hourly rate", active: "Enabled", scheduled_date: "Visit date", season_start: "Season start", season_end: "Season end" };
function object(value: Json | null): Record<string, Json | undefined> { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
export function CustomerHistory({ customerId }: { customerId: string }) {
  const { companyId, role } = useWorkspace();
  const allowed = can(role, "customers.manage") || role === "read_only";
  const q = useQuery({ queryKey: ["customer-history", companyId, customerId], enabled: allowed, refetchInterval: 60000, queryFn: async () => {
    const sync = await supabase.rpc("sync_customer_history", { _customer: customerId }); if (sync.error) throw sync.error;
    const { data, error } = await supabase.from("customer_history").select("*").eq("company_id", companyId).eq("customer_id", customerId).order("created_at", { ascending: false }); if (error) throw error; return data ?? [];
  }});
  if (!allowed) return null;
  return <section className="my-6 border-t pt-5"><h2 className="mb-3 text-xl font-bold">Customer history</h2>
    {q.isError && <p role="alert" className="text-destructive">{q.error.message}</p>}
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : !q.data?.length ? <p className="text-sm text-muted-foreground">No changes recorded yet.</p> : <ol className="divide-y">{q.data.map(row => {
      const before = object(row.before_values), after = object(row.after_values);
      const changes = Object.keys(fields).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]) && (before[key] !== undefined || after[key] !== undefined));
      return <li key={row.id} className="py-3"><p className="font-semibold">{row.summary}</p><p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()} · {row.actor_id ? "Staff change" : "Automatic"}{row.effective_date !== row.created_at.slice(0,10) ? ` · Effective ${row.effective_date}` : ""}</p>
        {!!changes.length && <details className="mt-1 text-sm"><summary className="cursor-pointer text-muted-foreground">Details</summary><dl className="mt-2 space-y-1">{changes.map(key => <div key={key}><dt className="inline font-medium">{fields[key]}: </dt><dd className="inline">{row.before_values ? `${String(before[key] ?? "—")} → ` : ""}{String(after[key] ?? "—")}</dd></div>)}</dl></details>}
      </li>;
    })}</ol>}
  </section>;
}