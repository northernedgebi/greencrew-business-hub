import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { Card, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/invoices/$id")({ component: InvoiceDetail });

function InvoiceDetail() {
  const { id } = Route.useParams();
  const { companyId } = useWorkspace();
  const qc = useQueryClient();
  const key = ["invoice", id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [inv, items, pays] = await Promise.all([
        supabase.from("invoices").select("*, customer:customers(id, name, email)").eq("id", id).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id),
        supabase.from("payments").select("*").eq("invoice_id", id).order("paid_at"),
      ]);
      if (inv.error) throw inv.error;
      return { inv: inv.data, items: items.data ?? [], pays: pays.data ?? [] };
    },
  });
  const [item, setItem] = useState({ description: "", quantity: "1", unit_price: "" });
  const [pay, setPay] = useState({ amount: "", method: "card" });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["invoices", companyId] }); };

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) { toast.error(error.message); return false; }
    refresh();
    return true;
  }

  if (q.isLoading || !q.data) return <Spinner />;
  const { inv, items, pays } = q.data;
  const balance = Number(inv.total) - Number(inv.amount_paid);
  const locked = inv.status === "void";

  return (
    <>
      <Link to="/app/invoices" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"><ArrowLeft className="h-4 w-4" />Invoices</Link>
      <PageHeader title={`Invoice #${inv.number}`} subtitle={`${inv.customer?.name} · issued ${inv.issue_date} · due ${inv.due_date}`}
        action={<div className="flex flex-wrap items-center gap-2"><StatusBadge status={inv.status} />
          {inv.status === "draft" && <Button size="sm" onClick={() => run(supabase.from("invoices").update({ status: "sent" }).eq("id", id))}>Mark as sent</Button>}
          {!locked && inv.status !== "paid" && <Button size="sm" variant="ghost" onClick={() => confirm("Void this invoice?") && run(supabase.from("invoices").update({ status: "void" }).eq("id", id))}>Void</Button>}
        </div>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-bold">Line items</h2>
          <div className="divide-y">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex-1">{it.description} <span className="text-muted-foreground">× {Number(it.quantity)}</span></span>
                <span className="font-medium">{money(Number(it.quantity) * Number(it.unit_price))}</span>
                {!locked && <button className="p-2 text-muted-foreground" onClick={() => run(supabase.from("invoice_items").delete().eq("id", it.id))}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          {!locked && (
            <form className="mt-3 grid grid-cols-6 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(supabase.from("invoice_items").insert({ company_id: companyId, invoice_id: id, description: item.description, quantity: Number(item.quantity), unit_price: Number(item.unit_price) }))) setItem({ description: "", quantity: "1", unit_price: "" }); }}>
              <Input className="col-span-6 h-11 sm:col-span-3" placeholder="Description" required value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
              <Input className="col-span-2 h-11 sm:col-span-1" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value })} />
              <Input className="col-span-2 h-11 sm:col-span-1" type="number" min="0" step="0.01" placeholder="Price" required value={item.unit_price} onChange={(e) => setItem({ ...item, unit_price: e.target.value })} />
              <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1"><Plus /></Button>
            </form>
          )}
          <div className="mt-5 space-y-1 border-t pt-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
            <div className="flex items-center justify-between"><span>Tax rate %</span>
              <Input disabled={locked} className="h-9 w-24 text-right" type="number" step="0.01" min="0" defaultValue={Number(inv.tax_rate)} onBlur={async (e) => { await supabase.from("invoices").update({ tax_rate: Number(e.target.value) }).eq("id", id); await supabase.rpc("recalc_invoice" as never, { _id: id } as never); refresh(); }} />
            </div>
            <div className="flex justify-between font-display text-xl font-extrabold"><span>Total</span><span>{money(inv.total)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>{money(inv.amount_paid)}</span></div>
            <div className="flex justify-between font-bold"><span>Balance due</span><span>{money(balance)}</span></div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Payments</h2>
          {pays.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
          {pays.map((p) => <div key={p.id} className="flex justify-between py-1.5 text-sm"><span className="capitalize">{p.method} · {new Date(p.paid_at).toLocaleDateString()}</span><span className="font-semibold">{money(p.amount)}</span></div>)}
          {!locked && balance > 0 && (
            <form className="mt-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run(supabase.from("payments").insert({ company_id: companyId, invoice_id: id, amount: Number(pay.amount), method: pay.method }))) setPay({ amount: "", method: "card" }); }}>
              <Label>Record a payment</Label>
              <Input className="h-11" type="number" step="0.01" min="0.01" max={balance} placeholder={balance.toFixed(2)} required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option value="card">Card</option><option value="check">Check</option><option value="cash">Cash</option><option value="ach">Bank transfer</option>
              </select>
              <Button type="submit" className="w-full">Record payment</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
