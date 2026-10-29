import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { snowCharge, type SnowPricing } from "@/lib/snow-pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SnowTimeEntry({ job }: { job: SnowPricing & { id: string; title: string; status: string; invoice_id?: string | null } }) {
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  if (job.pricing_mode !== "hourly") return null;
  const editable = can(role, "jobs.updateStatus") && !job.invoice_id && job.status !== "cancelled";
  const n = hours.trim() ? Number(hours) : null;
  const valid = n !== null && Number.isFinite(n) && n >= 0;
  async function save(complete: boolean) {
    if (!valid || n === null) return;
    setBusy(true);
    const { error } = await supabase.from("jobs").update({ worked_hours: n, ...(complete ? { status: "completed" as const, completed_at: new Date().toISOString() } : {}) }).eq("company_id", companyId).eq("id", job.id).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries(); setOpen(false); toast.success(complete ? "Time saved and visit completed" : "Crew time saved");
  }
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <span className="text-muted-foreground">{money(job.hourly_rate ?? 0)}/hr · {job.worked_hours === null ? "Time not entered" : `${job.worked_hours} hours worked`}{job.minimum_hours ? ` · ${job.minimum_hours} hr minimum` : " · No minimum"}</span>
    {editable && <Button size="sm" variant="outline" onClick={() => { setHours(job.worked_hours === null ? "" : String(job.worked_hours)); setOpen(true); }}><Clock />Enter crew time</Button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Crew time · {job.title}</DialogTitle></DialogHeader>
      <div className="space-y-3"><Label htmlFor={`hours-${job.id}`}>Total hours worked</Label><Input id={`hours-${job.id}`} type="number" min="0" step="0.01" placeholder="e.g. 0.5" value={hours} onChange={e => setHours(e.target.value)} />
      {valid && <p className="font-semibold">Visit charge: {money(snowCharge("hourly", job.hourly_rate ?? 0, n, job.minimum_hours))}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!valid || busy} onClick={() => save(false)}>Save time</Button>{job.status !== "completed" && <Button variant="secondary" disabled={!valid || busy} onClick={() => save(true)}>Save & complete</Button>}</div></div>
    </DialogContent></Dialog>
  </div>;
}