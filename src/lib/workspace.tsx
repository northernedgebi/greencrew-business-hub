import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyRole } from "@/lib/permissions";
import type { CrewAccess } from "@/lib/crew-access";

export type Membership = CrewAccess & {
  company_id: string;
  role: CompanyRole;
  company: { id: string; name: string; plan: string; subscription_status: string; trial_ends_at: string };
};

type Ctx = {
  userId: string;
  email: string | null;
  memberships: Membership[];
  current: Membership | null;
  companyId: string;
  role: CompanyRole | null;
  isSuperAdmin: boolean;
  isPortalCustomer: boolean;
  setCompany: (id: string) => void;
  loading: boolean;
  refetch: () => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);
const KEY = "lawnoffice.company";

export function useSessionUser() {
  return useQuery({
    queryKey: ["session-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const userQ = useSessionUser();
  const user = userQ.data;
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setSelected(localStorage.getItem(KEY));
  }, []);

  const q = useQuery({
    queryKey: ["workspace", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error("Sign in required");
      await supabase.rpc("accept_my_invites");
      const [m, r, c] = await Promise.all([
        supabase
          .from("company_members")
          .select("company_id, role, crew_id, schedule_visible_from, schedule_visible_until, company:companies(id, name, plan, subscription_status, trial_ends_at)")
          .eq("user_id", user.id),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("customers").select("id").eq("portal_user_id", user.id).limit(1),
      ]);
      if (m.error) throw m.error;
      return {
        memberships: (m.data ?? []) as unknown as Membership[],
        isSuperAdmin: (r.data ?? []).some((x) => x.role === "super_admin"),
        isPortalCustomer: (c.data ?? []).length > 0,
      };
    },
  });

  const memberships = q.data?.memberships ?? [];
  const current = memberships.find((m) => m.company_id === selected) ?? memberships[0] ?? null;

  const value: Ctx = {
    userId: user?.id ?? "",
    email: user?.email ?? null,
    memberships,
    current,
    companyId: current?.company_id ?? "",
    role: current?.role ?? null,
    isSuperAdmin: q.data?.isSuperAdmin ?? false,
    isPortalCustomer: q.data?.isPortalCustomer ?? false,
    setCompany: (id) => {
      localStorage.setItem(KEY, id);
      setSelected(id);
    },
    loading: userQ.isLoading || q.isLoading,
    refetch: () => q.refetch(),
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));
