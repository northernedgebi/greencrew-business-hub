import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, CalendarDays, Receipt, UsersRound, Settings, LogOut, Shield, MoreHorizontal, FileText, BarChart3, Map as MapIcon, Inbox,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { Logo, PLANS } from "@/components/marketing";
import { Spinner } from "@/components/app-ui";
import { uploadCompanyLogo } from "@/lib/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CompanyBrand } from "@/components/company-brand";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Business Workspace | LawnOffice" }, { name: "description", content: "Your LawnOffice landscaping company workspace." }, { property: "og:title", content: "Business Workspace | LawnOffice" }, { property: "og:description", content: "Your LawnOffice landscaping company workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: typeof Users; perm?: Permission; mobile?: boolean };
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { to: "/app/schedule", label: "Schedule", icon: CalendarDays, mobile: true },
  { to: "/app/routes", label: "Routes", icon: MapIcon, mobile: true },
  { to: "/app/customers", label: "Customers", icon: Users, mobile: true },
  { to: "/app/invoices", label: "Invoices", icon: Receipt, perm: "billing.manage", mobile: true },
  { to: "/app/requests", label: "Requests", icon: Inbox, perm: "billing.manage" },
  { to: "/app/estimates", label: "Estimates", icon: FileText, perm: "dashboard.financials" },
  { to: "/app/reports", label: "Reports", icon: BarChart3, perm: "dashboard.financials" },
  { to: "/app/team", label: "Team & Crews", icon: UsersRound, perm: "crews.manage" },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!ws.loading && ws.memberships.length === 0 && ws.isPortalCustomer) navigate({ to: "/portal" });
  }, [ws.loading, ws.memberships.length, ws.isPortalCustomer, navigate]);

  if (ws.loading) return <Spinner />;
  if (ws.memberships.length === 0) return ws.isPortalCustomer ? <Spinner /> : <Onboarding />;
  if (ws.current?.company.subscription_status === "suspended" && !ws.isSuperAdmin) return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div className="max-w-sm"><Logo /><h1 className="mt-6 font-display text-2xl font-bold">Account disabled</h1>
        <p className="mt-2 text-muted-foreground">{ws.current.company.name} has been disabled. Please contact LawnOffice support to restore access.</p>
        {ws.memberships.length > 1 && <Button className="mt-4" variant="outline" onClick={() => ws.setCompany(ws.memberships.find((m) => m.company_id !== ws.companyId)!.company_id)}>Switch company</Button>}
        <Button className="mt-4 ml-2" onClick={async () => { qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}>Sign out</Button></div>
    </div>
  );

  const items = NAV.filter((n) => !n.perm || can(ws.role, n.perm));
  const isActive = (to: string) => (to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(to));

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sideLinks = (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((n) => (
        <Link key={n.to} to={n.to} className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive(n.to) ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent"}`}>
          <n.icon className="h-5 w-5" />{n.label}
        </Link>
      ))}
      {ws.isSuperAdmin && (
        <Link to="/admin" className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"><Shield className="h-5 w-5" />Platform admin</Link>
      )}
    </nav>
  );
  const companyBlock = (
    <div className="mt-4 rounded-xl bg-sidebar-accent p-3 text-sm">
      {ws.memberships.length > 1 ? (
        <select className="w-full rounded-md bg-sidebar px-2 py-2 text-sidebar-foreground" value={ws.companyId} onChange={(e) => ws.setCompany(e.target.value)}>
          {ws.memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company.name}</option>)}
        </select>
      ) : (
        <p className="truncate font-semibold text-sidebar-accent-foreground">{ws.current?.company.name}</p>
      )}
      <p className="mt-1 text-xs text-sidebar-foreground/60">{ws.role && ROLE_LABELS[ws.role]} · {ws.email}</p>
      <button onClick={signOut} className="mt-3 flex items-center gap-2 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" />Sign out</button>
    </div>
  );

  const mobileItems = items.filter((n) => n.mobile).slice(0, 4);

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 md:flex">
        <div className="mb-6 px-2"><CompanyBrand name={ws.current?.company.name ?? "LawnOffice"} logoPath={ws.current?.company.logo_url} light /></div>
        {sideLinks}
        {companyBlock}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-forest px-4 md:hidden">
        <CompanyBrand name={ws.current?.company.name ?? "LawnOffice"} logoPath={ws.current?.company.logo_url} light />
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8 lg:px-10">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card md:hidden">
        {mobileItems.map((n) => (
          <Link key={n.to} to={n.to} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive(n.to) ? "text-primary" : "text-muted-foreground"}`}>
            <n.icon className="h-6 w-6" />{n.label}
          </Link>
        ))}
        <Sheet>
          <SheetTrigger className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground"><MoreHorizontal className="h-6 w-6" />More</SheetTrigger>
          <SheetContent side="right" className="flex w-72 flex-col border-0 bg-sidebar p-4">
            <div className="mb-6 mt-2 px-2"><CompanyBrand name={ws.current?.company.name ?? "LawnOffice"} logoPath={ws.current?.company.logo_url} light /></div>
            {sideLinks}
            {companyBlock}
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}

function Onboarding() {
  const ws = useWorkspace();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [extra, setExtra] = useState({ address: "", email: "", website: "" });
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("starter");
  useEffect(() => {
    const p = sessionStorage.getItem("lawnoffice.plan");
    if (p) setPlan(p);
  }, []);
  useEffect(() => { if (ws.email) setExtra((x) => (x.email ? x : { ...x, email: ws.email ?? "" })); }, [ws.email]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("create_company", { _name: name, ...(phone ? { _phone: phone } : {}), _plan: plan });
    if (error) { setBusy(false); return toast.error(error.message); }
    const id = data as string;
    const upd = await supabase.from("companies").update({
      address: extra.address.trim() || null, email: extra.email.trim() || null, website: extra.website.trim() || null,
    }).eq("id", id);
    if (upd.error) toast.error(upd.error.message);
    if (logo) await uploadCompanyLogo(id, logo).catch((err: Error) => toast.error(`Logo not saved: ${err.message}`));
    setBusy(false);
    ws.setCompany(id);
    ws.refetch();
    toast.success("Your workspace is ready");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-hero px-4 py-8">
      <form onSubmit={create} className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6 shadow-2xl sm:p-8">
        <Logo />
        <h1 className="pt-4 text-2xl font-bold">Set up your company</h1>
        <p className="text-sm text-muted-foreground">You'll be the owner of this workspace. If a company invited you, ask them to send the invite to {ws.email}.</p>
        <div className="space-y-1.5"><Label>Company name</Label><Input className="h-12" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Green Acres Lawn Care" /></div>
        <div className="space-y-1.5"><Label>Business address</Label><Input className="h-12" value={extra.address} onChange={(e) => setExtra({ ...extra, address: e.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Business phone</Label><Input className="h-12" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Business email</Label><Input className="h-12" type="email" value={extra.email} onChange={(e) => setExtra({ ...extra, email: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Website</Label><Input className="h-12" type="url" placeholder="https://" value={extra.website} onChange={(e) => setExtra({ ...extra, website: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Logo (optional, up to 2 MB)</Label><Input className="h-12 pt-3" type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></div>
        <p className="text-sm text-muted-foreground">Primary administrator: <span className="font-medium text-foreground">{ws.email}</span></p>
        <div className="space-y-1.5"><Label>Plan</Label>
          <div className="grid grid-cols-3 gap-2">
            {PLANS.map((p) => (
              <button type="button" key={p.id} onClick={() => setPlan(p.id)} className={`rounded-lg border p-3 text-left text-sm ${plan === p.id ? "border-primary bg-secondary" : ""}`}>
                <span className="block font-semibold">{p.name}</span><span className="text-muted-foreground">${p.price}/mo</span>
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Creating…" : "Start 14-day trial"}</Button>
      </form>
    </div>
  );
}
