import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { nearbyServices } from "@/lib/customer-services";
import { localDate } from "@/lib/scheduling";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function NearbyServiceSuggestions({ customerId }: { customerId?: string }) {
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<{ service: string; lawn: string } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const today = localDate(new Date());
  const q = useQuery({ queryKey: ["nearby-services", companyId, customerId, today], enabled: can(role, "customers.manage"), queryFn: async () => {
    let query = supabase.from("jobs").select("id,title,customer_id,property_id,crew_id,scheduled_date,status,service_kind,customer:customers(name),crew:crews(name)").eq("company_id", companyId).eq("status", "scheduled").gte("scheduled_date", today).lte("scheduled_date", localDate(addDays(new Date(), 90)));
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query;
    if (error) throw error;
    return nearbyServices(data ?? [], today);
  }});
  const move = useMutation({ mutationFn: async () => {
    if (!selected) throw new Error("Choose a visit");
    const { error } = await supabase.rpc("combine_service_visit", { _service: selected.service, _lawn: selected.lawn });
    if (error) throw error;
  }, onSuccess: () => { toast.success("Service moved onto the lawn visit’s day and crew"); qc.invalidateQueries(); setSelected(null); }, onError: e => toast.error(e.message) });
  const suggestions = (q.data ?? []).filter(p => !dismissed.includes(`${p.service.id}:${p.lawn.id}`));
  const pair = q.data?.find(p => p.service.id === selected?.service && p.lawn.id === selected?.lawn);
  if (!can(role, "customers.manage") || !suggestions.length) return null;
  const date = (d: string) => format(parseISO(d), "EEE, MMM d");
  return <section className="mb-5 border-l-4 border-warning bg-warning/10 p-4">
    <h2 className="flex items-center gap-2 font-bold"><CalendarCheck className="h-5 w-5" />Nearby services · within 3 days</h2>
    <div className="mt-3 divide-y">{suggestions.map(({ service, lawn }) => <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0"><p className="font-semibold">{service.customer?.name} · {service.title}</p><p className="text-sm text-muted-foreground">{date(service.scheduled_date)} → lawn visit {date(lawn.scheduled_date)} · {lawn.crew?.name ?? "Unassigned"}</p></div>
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setDismissed([...dismissed, `${service.id}:${lawn.id}`])}>Keep dates</Button><Button size="sm" onClick={() => setSelected({ service: service.id, lawn: lawn.id })}>Combine visits</Button></div>
    </div>)}</div>
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Move service to lawn visit?</DialogTitle></DialogHeader>{pair && <p>Move {pair.service.title} from {date(pair.service.scheduled_date)} to {date(pair.lawn.scheduled_date)}, assigned to {pair.lawn.crew?.name ?? "no crew"}? The price stays unchanged; future recurring dates stay unchanged.</p>}<Button disabled={move.isPending} onClick={() => move.mutate()}>Confirm move</Button></DialogContent></Dialog>
  </section>;
}