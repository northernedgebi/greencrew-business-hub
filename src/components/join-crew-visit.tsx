import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { availableCrewVisits, type CrewVisit } from "@/lib/customer-services";
import { localDate } from "@/lib/scheduling";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
type Visit = CrewVisit & { title: string; crew: { name: string } | null };
export function JoinCrewVisit({ visit, visits }: { visit: Visit; visits: Visit[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const options = availableCrewVisits(visits, visit.customer_id, visit.property_id ?? "", localDate(new Date()), visit.id);
  const join = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc("join_service_visit", { _service: visit.id, _target: target, _timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries(); toast.success("Task added to the crew visit; its charge stays separate"); setOpen(false); }, onError: e => toast.error(e.message) });
  if (!options.length || visit.status !== "scheduled") return null;
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline">Join crew visit</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Combine {visit.title}</DialogTitle></DialogHeader>
    <Select value={target} onValueChange={setTarget}><SelectTrigger aria-label="Existing crew visit"><SelectValue placeholder="Choose a visit at this address" /></SelectTrigger><SelectContent>{options.map(v => <SelectItem key={v.id} value={v.id}>{v.scheduled_date} · {v.crew?.name} · {v.title}</SelectItem>)}</SelectContent></Select>
    <p className="text-sm text-muted-foreground">This task moves to that visit’s day and crew. Its price and future recurring visits stay unchanged.</p>
    <Button disabled={!target || join.isPending} onClick={() => join.mutate()}>Confirm shared visit</Button>
  </DialogContent></Dialog>;
}