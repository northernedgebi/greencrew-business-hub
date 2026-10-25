import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card, Spinner } from "@/components/app-ui";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
type CalJob = { id: string; title: string; status: string; scheduled_date: string; customer: { name: string } | null; crew: { name: string } | null };

/** Month grid of visits. Drag a visit onto another day to move it (completed/cancelled visits stay put). */
export function MonthCalendar({ onOpenDay }: { onOpenDay: (day: string) => void }) {
  const { companyId } = useWorkspace();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [crew, setCrew] = useState("all");
  const [over, setOver] = useState<string | null>(null);

  const days = useMemo(() => {
    const first = new Date(month); first.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  }, [month]);
  const from = iso(days[0]!), to = iso(days[41]!);

  const crews = useQuery({ queryKey: ["crews", companyId], queryFn: async () => (await supabase.from("crews").select("id, name").eq("company_id", companyId).order("name")).data ?? [] });
  const jobs = useQuery({
    queryKey: ["jobs", companyId, "month", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("id, title, status, scheduled_date, crew_id, customer:customers(name), crew:crews(name)").eq("company_id", companyId).gte("scheduled_date", from).lte("scheduled_date", to).order("route_order", { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const byDay = useMemo(() => {
    const m = new Map<string, CalJob[]>();
    for (const j of jobs.data ?? []) {
      if (crew !== "all" && (crew === "none" ? j.crew_id : j.crew_id !== crew)) continue;
      m.set(j.scheduled_date, [...(m.get(j.scheduled_date) ?? []), j as CalJob]);
    }
    return m;
  }, [jobs.data, crew]);

  async function drop(day: string, id: string) {
    setOver(null);
    const j = jobs.data?.find((x) => x.id === id);
    if (!j || j.scheduled_date === day) return;
    if (j.status === "completed" || j.status === "cancelled") return toast.error("Completed or cancelled visits can't be moved");
    const { error } = await supabase.from("jobs").update({ scheduled_date: day, route_order: null }).eq("company_id", companyId).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${new Date(day + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`);
    qc.invalidateQueries({ queryKey: ["jobs", companyId] });
    qc.invalidateQueries({ queryKey: ["route-jobs", companyId] });
  }

  const today = iso(new Date());
  return (
    <Card className="!p-3 sm:!p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button>
        <h2 className="min-w-40 text-center font-display text-lg font-bold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <Button size="icon" variant="outline" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button>
        <select aria-label="Crew filter" className="ml-auto h-10 rounded-xl border bg-background px-3 text-sm" value={crew} onChange={(e) => setCrew(e.target.value)}>
          <option value="all">All crews</option>{crews.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="none">Unassigned</option>
        </select>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Drag a visit to another day to move it. Tap a day to open it.</p>
      {jobs.isLoading ? <Spinner /> : (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1 text-center font-semibold text-muted-foreground">{d}</div>)}
          {days.map((d) => {
            const key = iso(d), list = byDay.get(key) ?? [], inMonth = d.getMonth() === month.getMonth();
            return (
              <div key={key}
                onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                onDragLeave={() => setOver((o) => (o === key ? null : o))}
                onDrop={(e) => { e.preventDefault(); void drop(key, e.dataTransfer.getData("text/plain")); }}
                className={`min-h-20 rounded-lg border p-1 sm:min-h-28 ${inMonth ? "bg-background" : "bg-muted/50 text-muted-foreground"} ${over === key ? "ring-2 ring-primary" : ""}`}>
                <button className={`mb-1 grid h-6 w-6 place-items-center rounded-full font-semibold ${key === today ? "bg-primary text-primary-foreground" : ""}`} onClick={() => onOpenDay(key)}>{d.getDate()}</button>
                <div className="space-y-0.5">
                  {list.slice(0, 4).map((j) => {
                    const locked = j.status === "completed" || j.status === "cancelled";
                    return (
                      <div key={j.id} draggable={!locked} onDragStart={(e) => e.dataTransfer.setData("text/plain", j.id)} title={`${j.customer?.name ?? ""} — ${j.title}${j.crew ? ` (${j.crew.name})` : ""}`}
                        className={`truncate rounded px-1 py-0.5 ${locked ? "bg-muted text-muted-foreground line-through" : "cursor-grab bg-secondary text-secondary-foreground active:cursor-grabbing"}`}>
                        {j.customer?.name ?? j.title}
                      </div>
                    );
                  })}
                  {list.length > 4 && <button className="px-1 font-semibold text-primary" onClick={() => onOpenDay(key)}>+{list.length - 4} more</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
