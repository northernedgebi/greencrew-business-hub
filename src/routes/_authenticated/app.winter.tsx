import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader, Spinner } from "@/components/app-ui";
import { CustomerServices } from "@/components/customer-services";
import { StormVisits } from "@/components/storm-visits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/winter")({ component: WinterServices, head: () => ({ meta: [
  { title: "Snow & Winter Services | LawnOffice" }, { name: "description", content: "Manage snow plowing, snow removal and shoveling for your existing customers, crews and service addresses." },
  { property: "og:title", content: "Snow & Winter Services | LawnOffice" }, { property: "og:description", content: "Winter service prices, recurring plans and crew visits in LawnOffice." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }) });

function WinterServices() {
  const { companyId } = useWorkspace();
  const [customerId, setCustomerId] = useState("");
  const q = useQuery({ queryKey: ["winter-customers", companyId], queryFn: async () => {
    const { data, error } = await supabase.from("customers").select("id,name,properties(id,address),recurring_plans(service_kind),jobs(service_kind,status)").eq("company_id", companyId).order("name");
    if (error) throw error;
    return data ?? [];
  } });
  const selected = q.data?.find(c => c.id === customerId);
  return <>
    <PageHeader title="Snow & winter" subtitle="Snow plowing · Snow removal · Shoveling" />
    {q.isLoading ? <Spinner /> : q.isError ? <p role="alert" className="text-destructive">{q.error.message}</p> : <>
      <Select value={customerId} onValueChange={setCustomerId}><SelectTrigger className="max-w-lg" aria-label="Winter customer"><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{q.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      {selected ? <><Link className="mt-3 inline-block text-sm font-semibold text-primary underline" to="/app/customers/$id" params={{ id: selected.id }}>Open {selected.name}’s full account</Link><CustomerServices key={selected.id} customerId={selected.id} properties={selected.properties} winterOnly /><StormVisits key={"s"+selected.id} customerId={selected.id} properties={selected.properties} /></> : <div className="mt-6 divide-y border-y">
        {q.data?.filter(c => [...c.recurring_plans, ...c.jobs].some(s => ["snow_plowing", "snow_removal", "shoveling"].includes(s.service_kind))).map(c => <div key={c.id} className="flex items-center gap-3 py-4"><Snowflake className="h-5 w-5 text-primary" /><Link className="font-semibold text-primary underline" to="/app/customers/$id" params={{ id: c.id }}>{c.name}</Link></div>)}
        {!q.data?.some(c => [...c.recurring_plans, ...c.jobs].some(s => ["snow_plowing", "snow_removal", "shoveling"].includes(s.service_kind))) && <p className="py-6 text-sm text-muted-foreground">No winter services booked.</p>}
      </div>}
    </>}
  </>;
}