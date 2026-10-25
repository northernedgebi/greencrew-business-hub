import type { CompanyRole } from "@/lib/permissions";

export type CrewAccess = { crew_id: string | null; schedule_visible_from: string | null; schedule_visible_until: string | null };

export function isCrewUser(role: CompanyRole | null | undefined) {
  return role === "technician" || role === "crew_manager";
}

export function canSeeCrewDate(access: CrewAccess | null | undefined, date: string) {
  return !!access?.crew_id && !!access.schedule_visible_from && !!access.schedule_visible_until
    && date >= access.schedule_visible_from && date <= access.schedule_visible_until;
}

export function canSeeCrewJob(access: CrewAccess | null | undefined, crewId: string | null, date: string) {
  return !!crewId && crewId === access?.crew_id && canSeeCrewDate(access, date);
}