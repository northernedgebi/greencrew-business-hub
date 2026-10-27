import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DeleteRecord } from "@/components/delete-record";

export const Route = createFileRoute("/_authenticated/app/estimates")({
  head: () => ({ meta: [{ title: "Estimates | LawnOffice" }, { name: "description", content: "Manage landscaping proposals, customer quotes and approvals." }, { property: "og:title", content: "Estimates | LawnOffice" }, { property: "og:description", content: "Manage landscaping proposals, customer quotes and approvals." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Estimates,
});

const STATUSES = ["draft", "sent", "accepted", "declined"] as const;
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";

function Estimates() {
  const { companyId, role } = useWorkspace();
  const manage = can(role, "customers.manage");
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const q = useQuery({
    queryKey: ["estimates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimates").select("id, title, status, total, valid_until, notes, created_at, customer:customers(name), property:properties(address)").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("estimates").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["estimates", companyId] });
  }
  const list = (q.data ?? []).filter((e) => filter === "all" || e.status === filter);
  const open = (q.data ?? []).filter((e) => e.status === "sent").reduce((s, e) => s + Number(e.total), 0);

  return (
    <>
      <PageHeader title="Estimates" subtitle={`${money(open)} awaiting customer approval`} action={manage && <NewEstimate />} />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} className="capitalize" onClick={() => setFilter(s)}>{s}</Button>)}
      </div>
      {q.isLoading ? <Spinner /> : list.length === 0 ? <Empty title="No estimates" text="Create a proposal for a customer and track whether they accept it." /> : (
        <Card className="divide-y p-0 sm:p-0">
          {list.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{e.title} · {(e.customer as { name: string } | null)?.name}</p>
                <p className="text-sm text-muted-foreground">{money(e.total)}{e.valid_until ? ` · valid until ${new Date(e.valid_until + "T00:00").toLocaleDateString()}` : ""}{e.property ? ` · ${(e.property as { address: string }).address}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={e.status} />
                {manage && <select aria-label="Change status" className="h-10 rounded-md border bg-background px-2 text-sm capitalize" value={e.status} onChange={(ev) => setStatus(e.id, ev.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
                {manage && <DeleteRecord table="estimates" id={e.id} name={e.title} description="The estimate will be removed. Any linked customer request stays, but loses its quote link; scheduled work stays unchanged." />}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

type Item = EstimateDraft["items"][number];

function NewEstimate() {
  const { companyId } = useWorkspace();
  const qc = useQueryClient();
  const [openD, setOpen] = useState(false);
  const [f, setF] = useState({ customer_id: "", property_id: "", title: "", total: "", valid_until: "", notes: "" });
  const [ask, setAsk] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [drafting, setDrafting] = useState(false);
  const draftFn = useServerFn(draftEstimate);
  const custs = useQuery({
    queryKey: ["est-customers", companyId], enabled: openD,
    queryFn: async () => (await supabase.from("customers").select("id, name, properties(id, address)").eq("company_id", companyId).order("name")).data ?? [],
  });
  const props = custs.data?.find((c) => c.id === f.customer_id)?.properties ?? [];
  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  function setItem(n: number, patch: Partial<Item>) { const next = items.map((it, i) => i === n ? { ...it, ...patch } : it); setItems(next); setF(v => ({ ...v, total: next.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2) })); }
  async function draft() {
    setDrafting(true);
    try {
      const d = await draftFn({ data: { companyId, description: ask } });
      setItems(d.items);
      setF(v => ({ ...v, title: d.title, notes: d.scope_notes, total: d.items.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2) }));
      toast.success("Draft ready — review the items");
    } catch (e) { toast.error((e as Error).message); } finally { setDrafting(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const lines = items.length ? `\n\nItems:\n${items.map(i => `- ${i.description}: ${i.quantity} × ${money(i.unit_price)} = ${money(i.quantity * i.unit_price)}`).join("\n")}` : "";
    const { error } = await supabase.from("estimates").insert({
      company_id: companyId, customer_id: f.customer_id, property_id: f.property_id || null, title: f.title.trim(),
      total: Number(f.total || 0), valid_until: f.valid_until || null, notes: (f.notes.trim() + lines).trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Estimate created");
    setOpen(false);
    setF({ customer_id: "", property_id: "", title: "", total: "", valid_until: "", notes: "" }); setItems([]); setAsk("");
    qc.invalidateQueries({ queryKey: ["estimates", companyId] });
  }
  return (
    <Dialog open={openD} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="lg"><Plus className="h-5 w-5" />New estimate</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New estimate</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5"><Label>Customer</Label><select required className={sel} value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value, property_id: "" })}><option value="">Choose…</option>{(custs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Property</Label><select className={sel} value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}><option value="">None</option>{props.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Title</Label><Input required className="h-11" placeholder="Spring cleanup and mulch" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Total ($)</Label><Input required className="h-11" type="number" min="0" step="0.01" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Valid until</Label><Input className="h-11" type="date" value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Scope / notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <Button type="submit" size="lg" className="w-full">Save estimate</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
