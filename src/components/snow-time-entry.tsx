import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Ruler, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { snowCharge, needsSnowReview, type SnowPricing } from "@/lib/snow-pricing";
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
  const perInch = job.pricing_mode === "per_inch";
  if (job.pricing_mode !== "hourly" && !perInch) return null;
  const editable = can(role, "jobs.updateStatus") && !job.invoice_id && job.status !== "cancelled";
  const n = hours.trim() ? Number(hours) : null;
  const valid = n !== null && Number.isFinite(n) && n >= 0;
  async function save(complete: boolean) {
    if (!valid || n === null) return;
    setBusy(true);
    const { error } = await supabase.from("jobs").update({ ...(perInch ? { snow_inches: n } : { worked_hours: n }), ...(complete ? { status: "completed" as const, completed_at: new Date().toISOString() } : {}) }).eq("company_id", companyId).eq("id", job.id).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries(); setOpen(false); toast.success(perInch ? complete ? "Visit completed — awaiting office review" : "Snow inches saved" : complete ? "Time saved and visit completed" : "Crew time saved");
  }
  async function approve() {
    if (job.snow_inches == null || job.per_inch_rate == null) return;
    setBusy(true);
    const { error } = await supabase.rpc("approve_snow_visit", { _job: job.id, _inches: job.snow_inches, _rate: job.per_inch_rate });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries(); toast.success("Snow measurements approved for billing");
  }
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <span className="text-muted-foreground">{perInch ? `${money(job.per_inch_rate ?? 0)}/inch · ${job.snow_inches == null ? "Inches not entered" : `${job.snow_inches} inches · ${money(job.price)}`}` : <>{money(job.hourly_rate ?? 0)}/hr · {job.worked_hours === null ? "Time not entered" : `${job.worked_hours} hours worked`}{job.minimum_hours ? ` · ${job.minimum_hours} hr minimum` : " · No minimum"}</>}</span>
    {perInch && needsSnowReview(job) && <span role="status" className="flex items-center gap-1 font-semibold text-warning"><AlertTriangle className="h-4 w-4" />Office review required</span>}
    {perInch && job.snow_reviewed_at && <span className="text-primary">Office approved</span>}
    {editable && <Button size="sm" variant="outline" onClick={() => { const amount = perInch ? job.snow_inches : job.worked_hours; setHours(amount == null ? "" : String(amount)); setOpen(true); }}>{perInch ? <Ruler /> : <Clock />}{perInch ? "Enter snow inches" : "Enter crew time"}</Button>}
    {perInch && needsSnowReview(job) && can(role, "billing.manage") && !job.invoice_id && <Button size="sm" variant="secondary" disabled={busy} onClick={approve}><Check />Approve inches & charge</Button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{perInch ? "Snow inches" : "Crew time"} · {job.title}</DialogTitle></DialogHeader>
      <div className="space-y-3"><Label htmlFor={`hours-${job.id}`}>{perInch ? "Snow inches" : "Total hours worked"}</Label><Input id={`hours-${job.id}`} type="number" min="0" step="0.01" placeholder={perInch ? "e.g. 4.5" : "e.g. 0.5"} value={hours} onChange={e => setHours(e.target.value)} />
      {valid && <p className="font-semibold">Visit charge: {money(snowCharge(perInch ? "per_inch" : "hourly", perInch ? job.per_inch_rate ?? 0 : job.hourly_rate ?? 0, n, job.minimum_hours))}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!valid || busy} onClick={() => save(false)}>{perInch ? "Save inches" : "Save time"}</Button>{job.status !== "completed" && <Button variant="secondary" disabled={!valid || busy} onClick={() => save(true)}>Save & complete</Button>}</div></div>
    </DialogContent></Dialog>
  </div>;
}