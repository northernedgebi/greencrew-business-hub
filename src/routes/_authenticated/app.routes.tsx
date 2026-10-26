import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Route as RouteIcon, ArrowRightLeft, MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { canSeeCrewDate, isCrewUser } from "@/lib/crew-access";
import { optimizeRoute, routeDistanceKm, type Point } from "@/lib/route-optimizer";
import { geocodeAddresses } from "@/lib/geocode.functions";
import { ScheduleDatePicker } from "@/components/schedule-date-picker";
import { Card, Empty, PageHeader, Spinner, StatusBadge } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MapStop } from "@/components/route-map";

const RouteMap = lazy(() => import("@/components/route-map"));

export const Route = createFileRoute("/_authenticated/app/routes")({
  component: Routes,
  head: () => ({ meta: [{ title: "Crew Routes | LawnOffice" }, { name: "description", content: "Plan the best stop order for each crew, see routes on a map and move stops between days." }, { property: "og:title", content: "Crew Routes | LawnOffice" }, { property: "og:description", content: "Optimized crew routes on a map." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const sel = "h-11 w-full rounded-xl border bg-background px-3 text-sm";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const JOB_COLS = "id, title, status, notes, route_order, start_time, scheduled_date, crew_id, property_id, customer:customers(name), property:properties(id, address, city, state, zip, lat, lng, gate_code, notes)";

type Job = { id: string; title: string; status: string; notes: string | null; route_order: number | null; property_id: string | null; customer: { name: string } | null; property: { id: string; address: string; city: string | null; state: string | null; zip: string | null; lat: number | null; lng: number | null; gate_code: string | null; notes: string | null } | null };
type Group = { key: string; name: string; property: Job["property"]; jobs: Job[]; order: number };
type Crew = { id: string; name: string; start_address: string | null; start_lat: number | null; start_lng: number | null };

const fullAddress = (p: NonNullable<Job["property"]>) => [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
const sortJobs = (a: Job, b: Job) => (a.route_order ?? 9999) - (b.route_order ?? 9999);

function Routes() {
  const { companyId, role, current } = useWorkspace();
  const restricted = isCrewUser(role);
  const manage = can(role, "jobs.manage");
  const qc = useQueryClient();
  const geocode = useServerFn(geocodeAddresses);
  const [day, setDay] = useState(today());
  const [crewId, setCrewId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<Job | null>(null);

  const crews = useQuery({
    queryKey: ["route-crews", companyId],
    queryFn: async () => ((await supabase.from("crews").select("id, name, start_address, start_lat, start_lng").eq("company_id", companyId).order("name")).data ?? []) as Crew[],
  });
  const activeCrew = restricted ? current?.crew_id ?? "" : crewId || crews.data?.[0]?.id || "";
  const crew = crews.data?.find((c) => c.id === activeCrew) ?? null;
  const visible = !restricted || canSeeCrewDate(current, day);

  const jobs = useQuery({
    queryKey: ["route-jobs", companyId, day, activeCrew],
    enabled: !!activeCrew && visible,
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select(JOB_COLS).eq("company_id", companyId).eq("scheduled_date", day).eq("crew_id", activeCrew).neq("status", "cancelled");
      if (error) throw error;
      return ((data ?? []) as unknown as Job[]).sort(sortJobs);
    },
  });

  /** Fills in missing map locations, computes the best order and saves it. */
  async function optimize(date: string, crewIdToRun: string, quiet = false) {
    const c = crews.data?.find((x) => x.id === crewIdToRun) ?? null;
    const { data, error } = await supabase.from("jobs").select(JOB_COLS).eq("company_id", companyId).eq("scheduled_date", date).eq("crew_id", crewIdToRun).neq("status", "cancelled");
    if (error) throw error;
    const list = (data ?? []) as unknown as Job[];
    const coords = new Map<string, Point>();
    let start: Point | null = c?.start_lat != null && c.start_lng != null ? { lat: c.start_lat, lng: c.start_lng } : null;
    const todo: { id: string; kind: "property" | "crew"; query: string }[] = [];
    if (c && !start && c.start_address) todo.push({ id: c.id, kind: "crew", query: c.start_address });
    for (const j of list) {
      if (!j.property) continue;
      if (j.property.lat != null && j.property.lng != null) coords.set(j.property.id, { lat: j.property.lat, lng: j.property.lng });
      else if (!todo.some((t) => t.id === j.property!.id)) todo.push({ id: j.property.id, kind: "property", query: fullAddress(j.property) });
    }
    for (let i = 0; i < todo.length; i += 8) {
      const res = await geocode({ data: { items: todo.slice(i, i + 8) } });
      for (const r of res) if (r.lat != null && r.lng != null) {
        if (r.kind === "crew") start = { lat: r.lat, lng: r.lng }; else coords.set(r.id, { lat: r.lat, lng: r.lng });
      }
    }
    const order = optimizeRoute(start, list.map((j) => { const p = j.property ? coords.get(j.property.id) : undefined; return { id: j.id, lat: p?.lat ?? null, lng: p?.lng ?? null }; }));
    const results = await Promise.all(order.map((id, i) => supabase.from("jobs").update({ route_order: i + 1 }).eq("company_id", companyId).eq("id", id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    const unlocated = list.filter((j) => !j.property || !coords.has(j.property.id)).length;
    if (!quiet) toast.success(unlocated ? `Route optimized — ${unlocated} address(es) couldn't be found and were put last` : "Route optimized");
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["route-jobs", companyId] });
    qc.invalidateQueries({ queryKey: ["route-crews", companyId] });
    qc.invalidateQueries({ queryKey: ["jobs", companyId] });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); refresh(); }
  }

  async function nudge(index: number, dir: -1 | 1) {
    const gs = [...groups];
    const other = gs[index + dir];
    if (!other) return;
    [gs[index], gs[index + dir]] = [gs[index + dir]!, gs[index]!];
    const reordered = gs.flatMap((g) => g.jobs);
    await run(async () => {
      const res = await Promise.all(reordered.map((j, i) => supabase.from("jobs").update({ route_order: i + 1 }).eq("company_id", companyId).eq("id", j.id)));
      const bad = res.find((r) => r.error); if (bad?.error) throw bad.error;
    });
  }

  async function move(job: Job, toDate: string, toCrew: string) {
    await run(async () => {
      const { error } = await supabase.from("jobs").update({ scheduled_date: toDate, crew_id: toCrew, route_order: null }).eq("company_id", companyId).eq("id", job.id);
      if (error) throw error;
      await optimize(day, activeCrew, true);
      await optimize(toDate, toCrew, true);
      toast.success("Stop moved — both routes re-optimized");
      setMoving(null);
    });
  }

  const start: Point | null = crew?.start_lat != null && crew.start_lng != null ? { lat: crew.start_lat, lng: crew.start_lng } : null;
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const j of jobs.data ?? []) {
      const key = `${j.property?.id ?? "none"}|${j.customer?.name ?? j.id}`;
      const g = map.get(key) ?? { key, name: j.customer?.name ?? "", property: j.property, jobs: [], order: 9999 };
      g.jobs.push(j);
      g.order = Math.min(g.order, j.route_order ?? 9999);
      map.set(key, g);
    }
    return [...map.values()].map((g) => ({ ...g, jobs: g.jobs.sort(sortJobs) })).sort((a, b) => a.order - b.order);
  }, [jobs.data]);
  const mapStops: MapStop[] = useMemo(() => groups.flatMap((g, i) => g.property?.lat != null && g.property.lng != null ? [{ id: g.key, n: i + 1, lat: g.property.lat, lng: g.property.lng, label: `${g.name} — ${g.property.address}` }] : []), [groups]);
  const km = routeDistanceKm(start, mapStops);
  const missingCount = (jobs.data?.length ?? 0) - mapStops.length;

  return (
    <>
      <PageHeader title={restricted ? "My route" : "Crew routes"} subtitle={restricted ? "Go to stops in this order. Tap a stop for notes and directions." : "Best stop order for each crew, on a map."} action={manage && activeCrew ? <Button disabled={busy || !jobs.data?.length} onClick={() => run(() => optimize(day, activeCrew))}><RouteIcon />{busy ? "Working…" : "Optimize route"}</Button> : undefined} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Day</Label>
            <ScheduleDatePicker value={day} onChange={setDay} min={restricted ? current?.schedule_visible_from ?? undefined : undefined} max={restricted ? current?.schedule_visible_until ?? undefined : undefined} /></div>
          <div className="space-y-1.5"><Label htmlFor="route-crew">Crew</Label>
            <select id="route-crew" className={sel} disabled={restricted} value={activeCrew} onChange={(e) => setCrewId(e.target.value)}>
              {crews.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        </div>
        {crew && !crew.start_address && manage && <p className="mt-3 text-sm text-muted-foreground">Tip: add a start address for {crew.name} on the Team & Crews page so routes begin and end there.</p>}
        {crew?.start_address && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />Starts and ends at {crew.start_address}</p>}
      </Card>

      {!crews.data ? <Spinner /> : !activeCrew ? <Empty title="No crews yet" text="Create a crew on the Team & Crews page to plan routes." /> : !visible ? <Empty title="Not available" text="This day is outside your enabled schedule dates." /> : jobs.isLoading ? <Spinner /> : !jobs.data?.length ? <Empty title="No stops this day" text="Assign visits to this crew on the Schedule page." /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{groups.length} {groups.length === 1 ? "stop" : "stops"} · {jobs.data.length} {jobs.data.length === 1 ? "visit" : "visits"}{mapStops.length > 0 ? ` · about ${(km * 0.621).toFixed(1)} mi straight-line` : ""}{missingCount > 0 ? ` · ${missingCount} not on the map yet${manage ? " (press Optimize route)" : ""}` : ""}</p>
            {groups.map((g, i) => (
              <Card key={g.key} className="!p-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{g.property ? fullAddress(g.property) : "No address"}</p>
                    {g.property?.gate_code && <p className="mt-1.5 text-sm"><span className="font-semibold">Gate code:</span> {g.property.gate_code}</p>}
                    {g.property?.notes && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted px-2.5 py-1.5 text-sm"><span className="font-semibold">Property notes:</span> {g.property.notes}</p>}
                    <div className="mt-2 space-y-1.5">
                      {g.jobs.map((j) => (
                        <div key={j.id} className="rounded-lg bg-secondary/60 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2 text-sm"><span className="truncate font-medium">{j.title}</span><StatusBadge status={j.status} /></div>
                            {manage && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Move ${j.title} to another day`} disabled={busy || j.status === "completed"} onClick={() => setMoving(j)}><ArrowRightLeft className="h-4 w-4" /></Button>}
                          </div>
                          {j.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground"><span className="font-semibold">Visit notes:</span> {j.notes}</p>}
                        </div>
                      ))}
                    </div>
                    {g.property && <a className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(fullAddress(g.property))}`}><MapPin className="h-4 w-4" />Directions</a>}
                  </div>
                  {manage && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Move up" disabled={busy || i === 0} onClick={() => nudge(i, -1)}><ArrowUp /></Button>
                        <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Move down" disabled={busy || i === groups.length - 1} onClick={() => nudge(i, 1)}><ArrowDown /></Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <ClientOnly fallback={<div className="h-[360px] rounded-2xl border bg-muted md:h-[480px]" />}>
              <Suspense fallback={<div className="h-[360px] rounded-2xl border bg-muted md:h-[480px]" />}><RouteMap start={start} stops={mapStops} /></Suspense>
            </ClientOnly>
          </div>
        </div>
      )}
      {moving && <MoveDialog job={moving} crews={crews.data ?? []} fromDay={day} fromCrew={activeCrew} busy={busy} restricted={restricted} min={restricted ? current?.schedule_visible_from ?? undefined : undefined} max={restricted ? current?.schedule_visible_until ?? undefined : undefined} onClose={() => setMoving(null)} onMove={(d, c) => move(moving, d, c)} />}
    </>
  );
}

function MoveDialog({ job, crews, fromDay, fromCrew, busy, restricted, min, max, onClose, onMove }: { job: Job; crews: Crew[]; fromDay: string; fromCrew: string; busy: boolean; restricted: boolean; min?: string | undefined; max?: string | undefined; onClose: () => void; onMove: (day: string, crew: string) => void }) {
  const [d, setD] = useState(fromDay);
  const [c, setC] = useState(fromCrew);
  const same = d === fromDay && c === fromCrew;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move {job.customer?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{job.property?.address}. Both routes are re-optimized after the move.</p>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>New day</Label><ScheduleDatePicker value={d} onChange={setD} min={min} max={max} /></div>
          <div className="space-y-1.5"><Label htmlFor="move-crew">Crew</Label>
            <select id="move-crew" className={sel} disabled={restricted} value={c} onChange={(e) => setC(e.target.value)}>{crews.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <Button className="h-11 w-full" disabled={busy || same} onClick={() => onMove(d, c)}>{busy ? "Moving…" : "Move stop"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
