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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerServiceFields } from "@/components/customer-service-fields";
import { newServiceForm, servicePayload } from "@/lib/customer-services";

export const Route = createFileRoute("/_authenticated/app/customers/")({ component: Customers, head: () => ({ meta: [{ title: "Customers & Services | LawnOffice" }, { name: "description", content: "Manage customers, properties and scheduled landscaping services." }, { property: "og:title", content: "Customers & Services | LawnOffice" }, { property: "og:description", content: "Customer records and landscaping service schedules." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

function Customers() {
  const { companyId, role } = useWorkspace();
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["customers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_accounts").select("id, name, email, phone, effective_status, inactivity_reason, properties(id, address)").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []).flatMap(c => c.id && c.name ? [{ ...c, id: c.id, name: c.name }] : []);
    },
    refetchInterval: 60000,
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
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-bold ${c.effective_status === "active" ? "bg-success/20 text-primary ring-2 ring-success/40" : "bg-destructive/15 text-destructive ring-2 ring-destructive/40"}`}>{c.name[0]?.toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">{c.properties[0]?.address ?? "No property"}{c.properties.length > 1 ? ` +${c.properties.length - 1}` : ""}</p>
                {c.inactivity_reason && <p className="text-xs text-destructive">{c.inactivity_reason}</p>}
              </div>
              <StatusBadge status={c.effective_status ?? "inactive"} />
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
  const [f, setF] = useState({ name: "", email: "", phone: "", customer_type: "residential", ein: "", address: "", city: "", state: "", zip: "", gate_code: "" });
  const [service, setService] = useState(newServiceForm);
  const crews = useQuery({ queryKey: ["crews", companyId], queryFn: async () => { const { data, error } = await supabase.from("crews").select("id,name").eq("company_id", companyId); if (error) throw error; return data ?? []; } });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_customer_with_service", { _company: companyId, _customer: { name: f.name, email: f.email, phone: f.phone, customer_type: f.customer_type, ein: f.customer_type === "commercial" ? f.ein : "" }, _property: { address: f.address, city: f.city, state: f.state, zip: f.zip, gate_code: f.gate_code }, _service: servicePayload(service) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer added");
      qc.invalidateQueries();
      setOpen(false);
      setF({ name: "", email: "", phone: "", customer_type: "residential", ein: "", address: "", city: "", state: "", zip: "", gate_code: "" });
      setService(newServiceForm());
    },
    onError: (e) => toast.error(e.message),
  });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1.5"><Label htmlFor={`customer-${k}`}>{label}</Label><Input id={`customer-${k}`} className="h-11" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required={k === "name" || k === "address"} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />New customer</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {field("name", "Full name")}
          <div className="space-y-1.5">
            <Label htmlFor="customer-type">Customer type</Label>
            <Select value={f.customer_type} onValueChange={(v) => setF({ ...f, customer_type: v })}>
              <SelectTrigger id="customer-type" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="residential">Residential</SelectItem>
                <SelectItem value="commercial">Company / Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {f.customer_type === "commercial" && field("ein", "EIN number (if available)")}
          <div className="grid gap-3 sm:grid-cols-2">{field("email", "Email", "email")}{field("phone", "Phone", "tel")}</div>
          {field("address", "Service address")}
          <div className="grid grid-cols-3 gap-3">{field("city", "City")}{field("state", "State")}{field("zip", "ZIP")}</div>
          {field("gate_code", "Gate code (if any)")}
          <div className="border-t pt-4"><h3 className="mb-3 font-bold">Initial service</h3><CustomerServiceFields value={service} onChange={setService} crews={crews.data ?? []} /></div>
          <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>Save customer</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
