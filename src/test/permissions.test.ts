import { describe, it, expect } from "vitest";
import { can, INVITABLE_ROLES } from "@/lib/permissions";

describe("role permissions", () => {
  it("technicians can only update job status", () => {
    expect(can("technician", "jobs.updateStatus")).toBe(true);
    expect(can("technician", "customers.manage")).toBe(false);
    expect(can("technician", "billing.manage")).toBe(false);
  });
  it("crew managers schedule jobs but cannot bill", () => {
    expect(can("crew_manager", "jobs.manage")).toBe(true);
    expect(can("crew_manager", "billing.manage")).toBe(false);
  });
  it("office managers handle billing but not company settings", () => {
    expect(can("office_manager", "billing.manage")).toBe(true);
    expect(can("office_manager", "company.settings")).toBe(false);
  });
  it("only owner manages company settings", () => {
    expect(can("owner", "company.settings")).toBe(true);
  });
  it("owner role cannot be invited", () => {
    expect(INVITABLE_ROLES).not.toContain("owner");
  });
});
