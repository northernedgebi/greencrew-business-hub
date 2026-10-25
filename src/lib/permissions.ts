export type CompanyRole = "owner" | "office_manager" | "crew_manager" | "technician" | "read_only";

export type Permission =
  | "dashboard.financials"
  | "customers.manage"
  | "jobs.manage"
  | "jobs.updateStatus"
  | "team.manage"
  | "crews.manage"
  | "billing.manage"
  | "company.settings";

// Mirrors the database RLS helpers: is_office (owner, office_manager) and is_manager (+ crew_manager).
const MATRIX: Record<CompanyRole, Permission[]> = {
  owner: [
    "dashboard.financials",
    "customers.manage",
    "jobs.manage",
    "jobs.updateStatus",
    "team.manage",
    "crews.manage",
    "billing.manage",
    "company.settings",
  ],
  office_manager: [
    "dashboard.financials",
    "customers.manage",
    "jobs.manage",
    "jobs.updateStatus",
    "team.manage",
    "crews.manage",
    "billing.manage",
  ],
  crew_manager: ["jobs.manage", "jobs.updateStatus", "crews.manage"],
  technician: ["jobs.updateStatus"],
  read_only: ["dashboard.financials"],
};

export function can(role: CompanyRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(perm);
}

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Owner",
  office_manager: "Office Administrator",
  crew_manager: "Crew Manager",
  technician: "Crew Member",
  read_only: "Read-Only User",
};

export const INVITABLE_ROLES: CompanyRole[] = ["office_manager", "crew_manager", "technician", "read_only"];
