import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can, INVITABLE_ROLES, ROLE_LABELS, type CompanyRole } from "@/lib/permissions";
import { Card, PageHeader, Spinner } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrewAccessFields } from "@/components/crew-access-fields";
import { isCrewUser, type CrewAccess } from "@/lib/crew-access";
import { DeleteRecord } from "@/components/delete-record";

export const Route = createFileRoute("/_authenticated/app/team")({ component: Team, head: () => ({ meta: [{ title: "Team & Crew Access | LawnOffice" }, { name: "description", content: "Manage LawnOffice invitations, crews and schedule access dates." }, { property: "og:title", content: "Team & Crew Access | LawnOffice" }, { property: "og:description", content: "Assign team members to crews and enable their schedule dates." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

function Team() {
  const { companyId, role, userId } = useWorkspace();
  const qc = useQueryClient();
  const office = can(role, "team.manage");
  const key = ["team", companyId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [members, invites, crews, employees] = await Promise.all([
        supabase.from("company_members").select("id, user_id, role, crew_id, schedule_visible_from, schedule_visible_until").eq("company_id", companyId),
        office ? supabase.from("company_invites").select("*").eq("company_id", companyId).is("accepted_at", null) : Promise.resolve({ data: [] as ({ id: string; email: string; role: CompanyRole } & CrewAccess)[] }),
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
  const emptyAccess: CrewAccess = { crew_id: null, schedule_visible_from: null, schedule_visible_until: null };
  const [inv, setInv] = useState({ email: "", role: "technician" as CompanyRole, ...emptyAccess });
  const [crewName, setCrewName] = useState("");
  const [emp, setEmp] = useState({ name: "", phone: "", title: "", crew_id: "" });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["crews", companyId] }); qc.invalidateQueries({ queryKey: ["workspace"] }); qc.invalidateQueries({ queryKey: ["jobs", companyId] }); qc.invalidateQueries({ queryKey: ["dashboard", companyId] }); };
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
              <div key={m.id} className="py-2.5 text-sm"><div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.profile?.full_name || m.profile?.email || "User"}</p><p className="truncate text-muted-foreground">{m.profile?.email}</p></div>
                {office && m.role !== "owner" && m.user_id !== userId ? (
                  <>
                    <select className={sel} value={m.role} onChange={(e) => run(supabase.from("company_members").update({ role: e.target.value as CompanyRole }).eq("id", m.id), "Role updated")}>
                      {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <DeleteRecord table="company_members" id={m.id} name={m.profile?.full_name || "team member"} description="This person loses access to this company. Their account and existing work records stay." />
                  </>
                ) : <span className="text-muted-foreground">{ROLE_LABELS[m.role as CompanyRole]}</span>}
              </div>{office && isCrewUser(m.role) && <EditCrewAccess key={`${m.id}-${m.crew_id}-${m.schedule_visible_from}-${m.schedule_visible_until}`} access={m} crews={q.data.crews} prefix={`member-${m.id}`} onSave={(access) => run(supabase.from("company_members").update(access).eq("company_id", companyId).eq("id", m.id), "Crew access updated")} />}</div>
            ))}
            {q.data.invites.map((i) => (
              <div key={i.id} className="py-2.5 text-sm"><div className="flex items-center gap-2">
                <div className="flex-1"><p className="font-semibold">{i.email}</p><p className="text-muted-foreground">Invite pending · {ROLE_LABELS[i.role]}</p></div>
                {office && <DeleteRecord table="company_invites" id={i.id} name={`invite for ${i.email}`} description="This pending invitation will be removed and cannot be accepted." />}
              </div>{office && isCrewUser(i.role) && <EditCrewAccess key={`${i.id}-${i.crew_id}-${i.schedule_visible_from}-${i.schedule_visible_until}`} access={i} crews={q.data.crews} prefix={`invite-${i.id}`} onSave={(access) => run(supabase.from("company_invites").update(access).eq("company_id", companyId).eq("id", i.id), "Invite access updated")} />}</div>
            ))}
          </div>
          {office && (
            <form className="mt-3 space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(supabase.from("company_invites").insert({ company_id: companyId, email: inv.email.trim().toLowerCase(), role: inv.role, ...(isCrewUser(inv.role) ? { crew_id: inv.crew_id, schedule_visible_from: inv.crew_id ? inv.schedule_visible_from : null, schedule_visible_until: inv.crew_id ? inv.schedule_visible_until : null } : emptyAccess) }), "Invite saved")) setInv({ email: "", role: "technician", ...emptyAccess }); }}>
              <div className="flex flex-col gap-2 sm:flex-row">
              <Input className="h-11 flex-1" type="email" required placeholder="email@company.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
              <select className={sel} value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as CompanyRole })}>{INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
              </div>
              {isCrewUser(inv.role) && <CrewAccessFields value={inv} onChange={(access) => setInv({ ...inv, ...access })} crews={q.data.crews} prefix="new-invite" />}
              <Button type="submit">Invite</Button>
            </form>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Crews</h2>
          <div className="space-y-2">
            {q.data.crews.map((c) => (
              <div key={c.id} className="rounded-xl bg-secondary p-2.5">
                <div className="flex items-center justify-between text-sm font-semibold">{c.name}
                  {can(role, "crews.manage") && <DeleteRecord table="crews" id={c.id} name={c.name} description="This crew will be removed. Its visits, plans, and employees become unassigned, and crew-linked user access is cleared." />}</div>
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("start") ?? "").trim(); void run(supabase.from("crews").update({ start_address: v || null, start_lat: null, start_lng: null }).eq("company_id", companyId).eq("id", c.id), "Route start saved"); }}>
                  <Input name="start" className="h-10 bg-background" placeholder="Route start address (yard / shop)" defaultValue={(c as { start_address?: string | null }).start_address ?? ""} />
                  <Button type="submit" size="sm" variant="outline" className="h-10">Save</Button>
                </form>
              </div>
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
                {can(role, "crews.manage") && <DeleteRecord table="employees" id={e.id} name={e.name} description="This employee record will be removed. App sign-in access and existing job records stay unchanged." />}
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

function EditCrewAccess({ access, crews, prefix, onSave }: { access: CrewAccess; crews: { id: string; name: string }[]; prefix: string; onSave: (value: CrewAccess) => Promise<boolean> }) {
  const [value, setValue] = useState<CrewAccess>({ crew_id: access.crew_id, schedule_visible_from: access.schedule_visible_from, schedule_visible_until: access.schedule_visible_until });
  const [busy, setBusy] = useState(false);
  return <form className="mt-3 space-y-2 border-t pt-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(value.crew_id ? value : { crew_id: null, schedule_visible_from: null, schedule_visible_until: null }); } finally { setBusy(false); } }}>
    <CrewAccessFields value={value} onChange={setValue} crews={crews} prefix={prefix} />
    <Button type="submit" size="sm" variant="outline" disabled={busy}>{busy ? "Saving…" : "Save crew access"}</Button>
  </form>;
}
