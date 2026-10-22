import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can, INVITABLE_ROLES, ROLE_LABELS, type CompanyRole } from "@/lib/permissions";
import { Card, PageHeader, Spinner } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/team")({ component: Team });

function Team() {
  const { companyId, role, userId } = useWorkspace();
  const qc = useQueryClient();
  const office = can(role, "team.manage");
  const key = ["team", companyId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [members, invites, crews, employees] = await Promise.all([
        supabase.from("company_members").select("id, user_id, role").eq("company_id", companyId),
        office ? supabase.from("company_invites").select("*").eq("company_id", companyId).is("accepted_at", null) : Promise.resolve({ data: [] as { id: string; email: string; role: CompanyRole }[] }),
        supabase.from("crews").select("id, name").eq("company_id", companyId).order("name"),
        supabase.from("employees").select("id, name, phone, title, crew_id, active").eq("company_id", companyId).order("name"),
      ]);
      const ids = (members.data ?? []).map((m) => m.user_id);
      const profiles = ids.length ? (await supabase.from("profiles").select("id, full_name, email").in("id", ids)).data ?? [] : [];
      return {
        members: (members.data ?? []).map((m) => ({ ...m, profile: profiles.find((p) => p.id === m.user_id) })),
        invites: invites.data ?? [],
        crews: crews.data ?? [],
        employees: employees.data ?? [],
      };
    },
  });
  const [inv, setInv] = useState({ email: "", role: "technician" as CompanyRole });
  const [crewName, setCrewName] = useState("");
  const [emp, setEmp] = useState({ name: "", phone: "", title: "", crew_id: "" });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["crews", companyId] }); };
  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok?: string) {
    const { error } = await p;
    if (error) { toast.error(error.message); return false; }
    if (ok) toast.success(ok);
    refresh();
    return true;
  }
  if (q.isLoading || !q.data) return <Spinner />;
  const sel = "h-11 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <>
      <PageHeader title="Team & crews" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-bold">App users</h2>
          <p className="mb-3 text-sm text-muted-foreground">People who sign in. Invited users join when they create an account with the invited email.</p>
          <div className="divide-y">
            {q.data.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.profile?.full_name || m.profile?.email || "User"}</p><p className="truncate text-muted-foreground">{m.profile?.email}</p></div>
                {office && m.role !== "owner" && m.user_id !== userId ? (
                  <>
                    <select className={sel} value={m.role} onChange={(e) => run(supabase.from("company_members").update({ role: e.target.value as CompanyRole }).eq("id", m.id), "Role updated")}>
                      {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <button className="p-2 text-muted-foreground" onClick={() => confirm("Remove access?") && run(supabase.from("company_members").delete().eq("id", m.id))}><Trash2 className="h-4 w-4" /></button>
                  </>
                ) : <span className="text-muted-foreground">{ROLE_LABELS[m.role as CompanyRole]}</span>}
              </div>
            ))}
            {q.data.invites.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2.5 text-sm">
                <div className="flex-1"><p className="font-semibold">{i.email}</p><p className="text-muted-foreground">Invite pending · {ROLE_LABELS[i.role]}</p></div>
                <button className="p-2 text-muted-foreground" onClick={() => run(supabase.from("company_invites").delete().eq("id", i.id))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {office && (
            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); if (await run(supabase.from("company_invites").insert({ company_id: companyId, email: inv.email.trim().toLowerCase(), role: inv.role }), "Invite saved")) setInv({ ...inv, email: "" }); }}>
              <Input className="h-11 flex-1" type="email" required placeholder="email@company.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
              <select className={sel} value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as CompanyRole })}>{INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
              <Button type="submit">Invite</Button>
            </form>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Crews</h2>
          <div className="flex flex-wrap gap-2">
            {q.data.crews.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium">{c.name}
                <button onClick={() => confirm("Delete crew?") && run(supabase.from("crews").delete().eq("id", c.id))}><Trash2 className="h-3.5 w-3.5" /></button></span>
            ))}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(supabase.from("crews").insert({ company_id: companyId, name: crewName }))) setCrewName(""); }}>
            <Input className="h-11" required placeholder="Crew name (e.g. Crew A)" value={crewName} onChange={(e) => setCrewName(e.target.value)} />
            <Button type="submit" variant="secondary"><Plus />Add</Button>
          </form>

          <h2 className="mb-3 mt-6 font-bold">Field employees</h2>
          <div className="divide-y">
            {q.data.employees.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-2.5 text-sm">
                <div className="flex-1"><p className="font-semibold">{e.name}</p><p className="text-muted-foreground">{[e.title, e.phone].filter(Boolean).join(" · ")}</p></div>
                <select className={sel} value={e.crew_id ?? ""} onChange={(ev) => run(supabase.from("employees").update({ crew_id: ev.target.value || null }).eq("id", e.id))}>
                  <option value="">No crew</option>{q.data.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="p-2 text-muted-foreground" onClick={() => confirm("Remove employee?") && run(supabase.from("employees").delete().eq("id", e.id))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={async (ev) => { ev.preventDefault(); if (await run(supabase.from("employees").insert({ company_id: companyId, name: emp.name, phone: emp.phone || null, title: emp.title || null, crew_id: emp.crew_id || null }))) setEmp({ name: "", phone: "", title: "", crew_id: "" }); }}>
            <Input className="h-11" required placeholder="Name" value={emp.name} onChange={(e) => setEmp({ ...emp, name: e.target.value })} />
            <Input className="h-11" placeholder="Phone" value={emp.phone} onChange={(e) => setEmp({ ...emp, phone: e.target.value })} />
            <Input className="h-11" placeholder="Title" value={emp.title} onChange={(e) => setEmp({ ...emp, title: e.target.value })} />
            <select className={sel} value={emp.crew_id} onChange={(e) => setEmp({ ...emp, crew_id: e.target.value })}><option value="">No crew</option>{q.data.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <Button type="submit" variant="secondary" className="col-span-2"><Plus />Add employee</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
