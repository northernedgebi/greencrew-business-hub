import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { SnowTimeEntry } from "@/components/snow-time-entry";

export function SnowReviewQueue() {
  const { companyId, role } = useWorkspace();
  const q = useQuery({ queryKey: ["snow-review", companyId], enabled: can(role, "billing.manage"), refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.from("jobs").select("*,customer:customers(name),property:properties(address)").eq("company_id", companyId).eq("pricing_mode", "per_inch").eq("status", "completed").is("snow_reviewed_at", null).is("invoice_id", null).order("scheduled_date");
    if (error) throw error; return data ?? [];
  }});
  if (!can(role, "billing.manage")) return null;
  if (q.isError) return <p role="alert" className="text-destructive">Snow review could not load: {q.error.message}</p>;
  if (!q.data?.length) return null;
  return <section className="mb-6 border-y border-warning py-4">
    <h2 className="mb-3 flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 text-warning" />Snow measurements awaiting review ({q.data.length})</h2>
    <div className="divide-y">{q.data.map(j => <div key={j.id} className="space-y-2 py-3"><p className="font-semibold">{j.customer?.name} · {j.title}</p><p className="text-sm text-muted-foreground">{j.scheduled_date} · {j.property?.address}</p><SnowTimeEntry job={j} /></div>)}</div>
  </section>;
}