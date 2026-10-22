import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/customers/")({ component: Customers });

function Customers() {
  const { companyId, role } = useWorkspace();
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["customers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, email, phone, status, properties(id, address)").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data;
    },
  });
  const list = (q.data ?? []).filter((c) => `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.properties.map((p) => p.address).join(" ")}`.toLowerCase().includes(term.toLowerCase()));

  return (
    <>
      <PageHeader title="Customers" subtitle={`${q.data?.length ?? 0} total`} action={can(role, "customers.manage") && <NewCustomer />} />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
        <Input className="h-12 pl-10" placeholder="Search name, phone, address…" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {q.isLoading ? <Spinner /> : list.length === 0 ? (
        <Empty title="No customers yet" text="Add your first customer and their service address." />
      ) : (
        <Card className="divide-y p-0 sm:p-0">
          {list.map((c) => (
            <Link key={c.id} to="/app/customers/$id" params={{ id: c.id }} className="flex items-center gap-3 p-4 hover:bg-muted/50">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{c.name[0]?.toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">{c.properties[0]?.address ?? "No property"}{c.properties.length > 1 ? ` +${c.properties.length - 1}` : ""}</p>
              </div>
              <StatusBadge status={c.status} />
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

function NewCustomer() {
  const { companyId } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", address: "", city: "", state: "", zip: "" });
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("customers").insert({ company_id: companyId, name: f.name, email: f.email || null, phone: f.phone || null }).select("id").single();
      if (error) throw error;
      if (f.address) {
        const r = await supabase.from("properties").insert({ company_id: companyId, customer_id: data.id, address: f.address, city: f.city || null, state: f.state || null, zip: f.zip || null });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast.success("Customer added");
      qc.invalidateQueries({ queryKey: ["customers", companyId] });
      setOpen(false);
      setF({ name: "", email: "", phone: "", address: "", city: "", state: "", zip: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1.5"><Label>{label}</Label><Input className="h-11" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required={k === "name"} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />New customer</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {field("name", "Full name")}
          <div className="grid gap-3 sm:grid-cols-2">{field("email", "Email", "email")}{field("phone", "Phone", "tel")}</div>
          {field("address", "Service address")}
          <div className="grid grid-cols-3 gap-3">{field("city", "City")}{field("state", "State")}{field("zip", "ZIP")}</div>
          <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>Save customer</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
