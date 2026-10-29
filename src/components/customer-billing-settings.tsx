import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateMonthlyBilling } from "@/lib/monthly-billing";
import { localDate } from "@/lib/scheduling";
import type { Database } from "@/integrations/supabase/types";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
export function CustomerBillingSettings({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const [frequency, setFrequency] = useState(customer.billing_frequency);
  const [start, setStart] = useState(customer.billing_start ?? localDate(new Date()));
  const [end, setEnd] = useState(customer.billing_end ?? "");
  const [kind, setKind] = useState(customer.monthly_amount === null ? "work" : "fixed");
  const [amount, setAmount] = useState(customer.monthly_amount?.toString() ?? "");
  const [terms, setTerms] = useState(String(customer.payment_terms_days));
  const plans = useQuery({ queryKey: ["monthly-coverage", customer.id], queryFn: async () => {
    const { data, error } = await supabase.from("recurring_plans").select("id, service, monthly_included, property:properties(address)").eq("customer_id", customer.id).eq("active", true);
    if (error) throw error; return data ?? [];
  } });
  const refresh = () => qc.invalidateQueries();
  const save = useMutation({ mutationFn: async () => {
    const fixed = frequency === "monthly" && kind === "fixed";
    validateMonthlyBilling(frequency, start, end, fixed ? amount : "", fixed ? "combined" : customer.billing_mode);
    if (fixed && !amount) throw new Error("Enter the fixed monthly amount");
    if (!Number.isInteger(Number(terms)) || Number(terms) < 0 || Number(terms) > 365) throw new Error("Payment terms must be 0–365 days");
    const { data, error } = await supabase.from("customers").update({ billing_frequency: frequency, billing_start: frequency === "monthly" ? start : null, billing_end: end || null, monthly_amount: fixed ? Number(amount) : null, billing_mode: fixed ? "combined" : customer.billing_mode, payment_terms_days: Number(terms), billing_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).eq("id", customer.id).eq("company_id", customer.company_id).select("id").single();
    if (error) throw error; if (!data) throw new Error("Billing settings were not saved");
  }, onSuccess: () => { refresh(); toast.success("Billing schedule saved"); }, onError: e => toast.error(e.message) });
  const generate = useMutation({ mutationFn: async () => {
    const { data, error } = await supabase.rpc("generate_customer_monthly_invoice", { _customer: customer.id });
    if (error) throw error; return data;
  }, onSuccess: n => { refresh(); toast.success(n ? `${n} monthly invoice draft${n === 1 ? "" : "s"} created` : "No new bills due; existing monthly bills are not duplicated"); }, onError: e => toast.error(e.message) });
  const coverage = useMutation({ mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
    const { error } = await supabase.from("recurring_plans").update({ monthly_included: checked }).eq("id", id).eq("company_id", customer.company_id).select("id").single();
    if (error) throw error;
  }, onSuccess: refresh, onError: e => toast.error(e.message) });
  return <div className="mt-4 border-t pt-4">
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Billing schedule</Label><Select value={frequency} onValueChange={setFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Bill when I choose</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="payment-terms">Payment due after (days)</Label><Input id="payment-terms" type="number" min="0" max="365" required value={terms} onChange={e => setTerms(e.target.value)} /></div>
      </div>
      {frequency === "monthly" && <>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="billing-start">First billing date (repeats monthly)</Label><Input id="billing-start" type="date" required value={start} onChange={e => setStart(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="billing-end">Last billing date (optional)</Label><Input id="billing-end" type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Monthly bill</Label><Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="work">Completed work before billing date</SelectItem><SelectItem value="fixed">Fixed monthly service amount</SelectItem></SelectContent></Select></div>
        {kind === "fixed" && <div className="space-y-1.5"><Label htmlFor="monthly-amount">Monthly service amount ($)</Label><Input id="monthly-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /><p className="text-xs text-muted-foreground">One combined monthly bill. Included services are not charged again per visit; extras stay separately billable.</p></div>}
      </>}
      <Button type="submit" disabled={save.isPending}>Save billing schedule</Button>
    </form>
    {customer.billing_frequency === "monthly" && <div className="mt-4 space-y-3">
      {customer.monthly_amount !== null && <div className="space-y-2"><h3 className="text-sm font-semibold">Services included in the monthly amount</h3>{plans.data?.map(p => <label key={p.id} className="flex items-center gap-3 text-sm"><Checkbox checked={p.monthly_included} disabled={coverage.isPending} onCheckedChange={checked => coverage.mutate({ id: p.id, checked: checked === true })} /><span>{p.service} · {p.property?.address}</span></label>)}<p className="text-xs text-muted-foreground">Coverage applies to newly scheduled visits. Existing visits keep their original billing treatment.</p></div>}
      <p className="text-xs text-muted-foreground">Monthly drafts are created automatically on the billing date. Review and send each bill before it becomes due to the customer.</p>
      <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>Create due monthly drafts now</Button>
    </div>}
  </div>;
}