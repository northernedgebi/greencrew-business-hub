import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CustomerAccountControls({ customer }: { customer: { id: string; status: string; inactive_reason: string | null; overdue_hold_limit: number | null } }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(customer.status === "active" ? "active" : "inactive");
  const [reason, setReason] = useState(customer.inactive_reason || "Cancelled");
  const [limit, setLimit] = useState(customer.overdue_hold_limit?.toString() ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const value = limit.trim() ? Number(limit) : null;
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Enter a hold limit of zero or more");
      if (status === "inactive" && !reason.trim()) throw new Error("Enter an inactivity reason");
      const { error } = await supabase.from("customers").update({ status, inactive_reason: status === "inactive" ? reason.trim() : null, overdue_hold_limit: value }).eq("id", customer.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Customer status and billing rule saved"); },
    onError: e => toast.error(e.message),
  });
  return <form className="space-y-3 border-t pt-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
    <h2 className="font-bold">Status & billing hold</h2>
    <div className="space-y-1.5"><Label htmlFor="account-status">Customer status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="account-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active / reactivate</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
    {status === "inactive" && <div className="space-y-1.5"><Label htmlFor="inactive-reason">Why inactive?</Label><Input id="inactive-reason" placeholder="Cancelled, seasonal pause, billing…" required value={reason} onChange={e => setReason(e.target.value)} /></div>}
    <div className="space-y-1.5"><Label htmlFor="hold-limit">Overdue balance limit ($)</Label><Input id="hold-limit" type="number" min="0" step="0.01" placeholder="Any overdue amount" value={limit} onChange={e => setLimit(e.target.value)} /></div>
    <p className="text-xs text-muted-foreground">{limit.trim() ? `Billing hold above $${limit} overdue.` : "Billing hold for any overdue unpaid bill."} Invoice due dates determine when payment is overdue. Billing holds clear automatically after payment; manual inactivity does not.</p>
    <Button type="submit" disabled={save.isPending} className="w-full">Save status & billing rule</Button>
  </form>;
}