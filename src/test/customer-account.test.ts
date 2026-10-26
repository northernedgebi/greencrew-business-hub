import { describe, expect, it } from "vitest";
import { customerAccountState } from "@/lib/customer-account";

const bill = (total: number, amount_paid = 0, due_date = "2026-10-24", status = "sent") => ({ total, amount_paid, due_date, status });
const state = (invoices: ReturnType<typeof bill>[], limit: number | null = null, status = "active", reason: string | null = null) => customerAccountState(status, reason, limit, invoices, "2026-10-26");
describe("customer billing holds", () => {
  it("holds only when overdue debt exceeds $500", () => {
    expect(state([bill(500)], 500).status).toBe("active");
    expect(state([bill(500.01)], 500).status).toBe("on_hold");
  });
  it("ignores unpaid bills that are not overdue", () => expect(state([bill(600, 0, "2026-10-26"), bill(600, 0, "2026-10-27")], 500).status).toBe("active"));
  it("holds for any overdue unpaid amount with a blank limit", () => expect(state([bill(0.01)]).status).toBe("on_hold"));
  it("automatically reactivates after payment satisfies the rule", () => {
    expect(state([bill(700, 100)], 500).status).toBe("on_hold");
    expect(state([bill(700, 200)], 500).status).toBe("active");
    expect(state([bill(700, 700)]).status).toBe("active");
  });
  it("does not reactivate cancelled customers after payment", () => expect(state([bill(700, 700)], null, "inactive", "Cancelled")).toMatchObject({ status: "inactive", reason: "Cancelled" }));
  it("excludes draft and void invoices", () => expect(state([bill(700, 0, "2026-10-24", "draft"), bill(700, 0, "2026-10-24", "void")]).status).toBe("active"));
});