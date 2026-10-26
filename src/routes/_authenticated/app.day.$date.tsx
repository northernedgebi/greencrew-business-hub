import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, MapPin, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { DeleteRecord } from "@/components/delete-record";

export const Route = createFileRoute("/_authenticated/app/day/$date")({
  component: DayPage,
  head: () => ({ meta: [{ title: "Day Schedule | LawnOffice" }, { name: "description", content: "See what is booked for the day, crew by crew, in LawnOffice." }, { property: "og:title", content: "Day Schedule | LawnOffice" }, { property: "og:description", content: "See what is booked for the day, crew by crew." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

type DayJob = {
  id: string; title: string; status: JobStatus; price: number; start_time: string | null; route_order: number | null;
  customer: { name: string } | null; crew_id: string | null; crew: { name: string } | null;
  property: { address: string | null; city: string | null; zip: string | null; gate_code: string | null } | null;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function DayPage() {
  const { date } = Route.useParams();
  const { companyId, role } = useWorkspace();
  const qc = useQueryClient();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  const crews = useQuery({
    queryKey: ["crews", companyId],
    queryFn: async () => (await supabase.from("crews").select("id, name").eq("company_id", companyId).order("name")).data ?? [],
    enabled: valid,
  });
  const q = useQuery({
    queryKey: ["jobs", companyId, date],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs")
        .select("id, title, status, price, start_time, route_order, crew_id, customer:customers(name), crew:crews(name), property:properties(address, city, zip, gate_code)")
        .eq("company_id", companyId).eq("scheduled_date", date)
        .order("route_order", { nullsFirst: false }).order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as DayJob[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const { error } = await supabase.from("jobs").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", companyId] }),
    onError: (e) => toast.error(e.message),
  });

  if (!valid) return <Empty title="That day isn't on the schedule" text="Pick a date from the calendar." />;
  const jobs = q.data ?? [];
  const booked = jobs.filter((j) => j.status !== "cancelled").length;
  const done = jobs.filter((j) => j.status === "completed").length;
  const dayTotal = jobs.filter((j) => j.status !== "cancelled").reduce((s, j) => s + Number(j.price), 0);
  const rows = [
    ...(crews.data ?? []).map((c) => ({ id: c.id, name: c.name, jobs: jobs.filter((j) => j.crew_id === c.id) })),
    { id: "none", name: "Unassigned", jobs: jobs.filter((j) => !j.crew_id) },
  ];
  const label = new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <PageHeader
        title="Day schedule"
        subtitle={`${label} · ${booked} booked · ${done} done · ${money(dayTotal)}`}
        action={<Button variant="outline" asChild><Link to="/app/schedule">Open in schedule & dispatch</Link></Button>}
      />
      {q.isLoading || crews.isLoading ? <Spinner /> : booked === 0 ? <Empty title="Nothing booked this day" text="Create a job or generate visits from recurring plans." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const total = r.jobs.length;
            const rDone = r.jobs.filter((j) => j.status === "completed").length;
            return (
              <Card key={r.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{r.name}</h2>
                    <p className="whitespace-nowrap text-sm text-muted-foreground">{total} booked · {rDone} done · {total - rDone} left</p>
                  </div>
                </div>
                {total > 0 && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${Math.round((rDone / total) * 100)}%` }} />
                  </div>
                )}
                <ul className="mt-3 space-y-3 text-sm">
                  {r.jobs.map((j) => (
                    <li key={j.id} className="rounded-lg border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{j.customer?.name ?? j.title}</p>
                            <StatusBadge status={j.status} />
                          </div>
                          <p className="text-xs text-muted-foreground">{j.start_time ? `${j.start_time.slice(0, 5)} · ` : ""}{j.title} · {money(j.price)}</p>
                          {j.property?.address && (
                            <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?daddr=${encodeURIComponent([j.property.address, j.property.city, j.property.zip].filter(Boolean).join(", "))}`} className="mt-1 flex items-center gap-1 text-xs text-primary">
                              <MapPin className="h-3.5 w-3.5" />{j.property.address}{j.property.gate_code ? ` · Gate ${j.property.gate_code}` : ""}
                            </a>
                          )}
                        </div>
                        {can(role, "jobs.manage") && (
                          <div className="flex shrink-0 flex-col gap-1">
                            {j.status === "scheduled" && <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => setStatus.mutate({ id: j.id, status: "in_progress" })}><Play />Start</Button>}
                            {(j.status === "scheduled" || j.status === "in_progress") && <Button size="sm" className="h-8 px-2" onClick={() => setStatus.mutate({ id: j.id, status: "completed" })}><Check />Done</Button>}
                            {j.status !== "cancelled" && j.status !== "completed" && <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setStatus.mutate({ id: j.id, status: "cancelled" })}><X />Cancel</Button>}
                            <DeleteRecord table="jobs" id={j.id} name={j.title} description="This visit leaves the schedule and route. Invoice charges stay. Active recurring plans may recreate deleted occurrences when filled; cancel instead to skip permanently." />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                  {total === 0 && <li className="text-muted-foreground">Nothing booked.</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
