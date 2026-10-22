import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { Card, PageHeader, Spinner } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/settings")({ component: Settings });

function Settings() {
  const ws = useWorkspace();
  const owner = can(ws.role, "company.settings");
  const q = useQuery({ queryKey: ["company", ws.companyId], queryFn: async () => (await supabase.from("companies").select("*").eq("id", ws.companyId).single()).data });
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "" });
  useEffect(() => { if (q.data) setF({ name: q.data.name, phone: q.data.phone ?? "", email: q.data.email ?? "", address: q.data.address ?? "" }); }, [q.data]);
  if (q.isLoading || !q.data) return <Spinner />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("companies").update(f).eq("id", ws.companyId);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    ws.refetch();
  }
  return (
    <>
      <PageHeader title="Settings" subtitle={`Your role: ${ws.role ? ROLE_LABELS[ws.role] : ""}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Company profile</h2>
          <form onSubmit={save} className="space-y-3">
            {(["name", "phone", "email", "address"] as const).map((k) => (
              <div key={k} className="space-y-1.5"><Label className="capitalize">{k}</Label><Input className="h-11" disabled={!owner} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
            ))}
            {owner && <Button type="submit">Save changes</Button>}
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Subscription</h2>
          <p className="text-sm">Plan: <span className="font-semibold capitalize">{q.data.plan}</span></p>
          <p className="text-sm">Status: <span className="font-semibold capitalize">{q.data.subscription_status}</span></p>
          {q.data.subscription_status === "trialing" && <p className="text-sm">Trial ends {new Date(q.data.trial_ends_at).toLocaleDateString()}</p>}
          <p className="mt-3 text-sm text-muted-foreground">Online subscription checkout is coming next.</p>
        </Card>
      </div>
    </>
  );
}
