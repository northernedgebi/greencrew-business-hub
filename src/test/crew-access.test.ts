import { describe, expect, it } from "vitest";
import { canSeeCrewDate, canSeeCrewJob, isCrewUser } from "@/lib/crew-access";

const access = { crew_id: "crew-a", schedule_visible_from: "2026-10-25", schedule_visible_until: "2026-10-31" };
describe("crew schedule visibility", () => {
  it("includes both enabled date boundaries", () => {
    expect(canSeeCrewDate(access, "2026-10-25")).toBe(true);
    expect(canSeeCrewDate(access, "2026-10-31")).toBe(true);
  });
  it("hides dates outside the enabled range", () => {
    expect(canSeeCrewDate(access, "2026-10-24")).toBe(false);
    expect(canSeeCrewDate(access, "2026-11-01")).toBe(false);
  });
  it("only shows jobs for the mapped crew", () => {
    expect(canSeeCrewJob(access, "crew-a", "2026-10-27")).toBe(true);
    expect(canSeeCrewJob(access, "crew-b", "2026-10-27")).toBe(false);
    expect(canSeeCrewJob(access, null, "2026-10-27")).toBe(false);
  });
  it("denies access without a crew and complete date range", () => {
    expect(canSeeCrewDate(null, "2026-10-27")).toBe(false);
    expect(canSeeCrewDate({ ...access, crew_id: null }, "2026-10-27")).toBe(false);
    expect(canSeeCrewDate({ ...access, schedule_visible_until: null }, "2026-10-27")).toBe(false);
  });
  it("restricts technicians and crew managers, not office staff", () => {
    expect(isCrewUser("technician")).toBe(true);
    expect(isCrewUser("crew_manager")).toBe(true);
    expect(isCrewUser("owner")).toBe(false);
    expect(isCrewUser("office_manager")).toBe(false);
  });
});