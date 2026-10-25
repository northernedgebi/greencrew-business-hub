import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, Mail, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/customers/$id")({ component: CustomerDetail });

function CustomerDetail() {
  const { id } = Route.useParams();
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const manage = can(role, "customers.manage");
  const key = ["customer", id];

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [c, props, jobs, invoices, notes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("properties").select("*").eq("customer_id", id).order("created_at"),
        supabase.from("jobs").select("id, title, scheduled_date, status, price").eq("customer_id", id).order("scheduled_date", { ascending: false }).limit(20),
        supabase.from("invoices").select("id, number, total, amount_paid, status, issue_date").eq("customer_id", id).order("issue_date", { ascending: false }),
        supabase.from("messages").select("id, body, created_at, channel").eq("customer_id", id).order("created_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      return { c: c.data, props: props.data ?? [], jobs: jobs.data ?? [], invoices: invoices.data ?? [], notes: notes.data ?? [] };
    },
  });

  const [addr, setAddr] = useState({ address: "", city: "", zip: "", gate_code: "" });
  const [note, setNote] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const addProp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").insert({ company_id: companyId, customer_id: id, address: addr.address, city: addr.city || null, zip: addr.zip || null, gate_code: addr.gate_code || null });
      if (error) throw error;
    },
    onSuccess: () => { setAddr({ address: "", city: "", zip: "", gate_code: "" }); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("messages").insert({ company_id: companyId, customer_id: id, body: note, channel: "note" });
      if (error) throw error;
    },
    onSuccess: () => { setNote(""); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  async function toggleStatus() {
    const { error } = await supabase.from("customers").update({ status: q.data!.c.status === "active" ? "inactive" : "active" }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function delProp(pid: string) {
    const { error } = await supabase.from("properties").delete().eq("id", pid);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function delCustomer() {
    if (!confirm("Delete this customer and all their records?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers", companyId] });
    navigate({ to: "/app/customers" });
  }

  if (q.isLoading || !q.data) return <Spinner />;
  const { c, props, jobs, invoices, notes } = q.data;
  const balance = invoices.filter((i) => i.status !== "void" && i.status !== "draft").reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);

  return (
    <>
      <Link to="/app/customers" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"><ArrowLeft className="h-4 w-4" />Customers</Link>
      <PageHeader title={c.name} action={<div className="flex gap-2"><StatusBadge status={c.status} />{manage && <><Button variant="outline" size="sm" onClick={toggleStatus}>{c.status === "active" ? "Deactivate" : "Activate"}</Button><Button variant="ghost" size="sm" onClick={delCustomer}><Trash2 /></Button></>}</div>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 font-medium"><Phone className="h-4 w-4 text-primary" />{c.phone}</a>}
          <p className="text-xs text-muted-foreground">{c.portal_user_id ? "Customer portal: connected" : c.email ? "Customer portal: they can sign up with this email to see visits and bills" : "Add an email so this customer can use the portal"}</p>
          {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all font-medium"><Mail className="h-4 w-4 text-primary" />{c.email}</a>}
          <div className="rounded-xl bg-secondary p-3"><p className="text-xs uppercase text-muted-foreground">Open balance</p><p className="font-display text-2xl font-extrabold">{money(balance)}</p></div>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-bold">Properties</h2>
          <div className="space-y-2">
            {props.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-xl border p-3">
                <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1 text-sm">
                  <a className="font-semibold" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent([p.address, p.city, p.zip].filter(Boolean).join(", "))}`}>{p.address}</a>
                  <p className="text-muted-foreground">{[p.city, p.state, p.zip].filter(Boolean).join(", ")}{p.gate_code ? ` · Gate ${p.gate_code}` : ""}</p>
                </div>
                {manage && <button onClick={() => delProp(p.id)} className="p-2 text-muted-foreground"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          {manage && (
            <form className="mt-3 grid gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); addProp.mutate(); }}>
              <Input className="h-11 sm:col-span-2" placeholder="Address" required value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} />
              <Input className="h-11" placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <Input className="h-11" placeholder="Gate code" value={addr.gate_code} onChange={(e) => setAddr({ ...addr, gate_code: e.target.value })} />
              <Button type="submit" variant="secondary"><Plus />Add</Button>
            </form>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-bold">Recent jobs</h2>
          {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No jobs yet.</p> : (
            <div className="divide-y">{jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between py-2.5 text-sm">
                <span><span className="font-medium">{j.title}</span> <span className="text-muted-foreground">· {j.scheduled_date}</span></span>
                <span className="flex items-center gap-2">{money(j.price)}<StatusBadge status={j.status} /></span>
              </div>))}
            </div>
          )}
          <h2 className="mb-3 mt-6 font-bold">Invoices</h2>
          {invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : (
            <div className="divide-y">{invoices.map((i) => (
              <Link key={i.id} to="/app/invoices/$id" params={{ id: i.id }} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">#{i.number} <span className="text-muted-foreground">· {i.issue_date}</span></span>
                <span className="flex items-center gap-2">{money(i.total)}<StatusBadge status={i.status} /></span>
              </Link>))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Notes & communication</h2>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a call, note, or request…" />
            <Button type="submit" size="sm" className="w-full">Add note</Button>
          </form>
          <div className="mt-4 space-y-3">{notes.map((n) => (
            <div key={n.id} className="rounded-lg bg-muted p-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>
          ))}</div>
        </Card>
      </div>
    </>
  );
}
