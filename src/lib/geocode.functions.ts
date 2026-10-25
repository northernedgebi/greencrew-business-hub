import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = { items: { id: string; kind: "property" | "crew"; query: string }[] };

/** Looks up map coordinates for addresses using OpenStreetMap (Nominatim). Max 8 per call, 1 req/sec. */
export const geocodeAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!Array.isArray(input?.items)) throw new Error("items required");
    return { items: input.items.slice(0, 8).map((i) => ({ id: String(i.id), kind: i.kind === "crew" ? "crew" as const : "property" as const, query: String(i.query).slice(0, 300) })) };
  })
  .handler(async ({ data, context }) => {
    const out: { id: string; kind: string; lat: number | null; lng: number | null }[] = [];
    for (const [n, item] of data.items.entries()) {
      if (n > 0) await new Promise((r) => setTimeout(r, 1100));
      let lat: number | null = null, lng: number | null = null;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(item.query)}`, {
          headers: { "User-Agent": "LawnOffice/1.0 (route planning)", "Accept-Language": "en" },
        });
        if (res.ok) {
          const json = (await res.json()) as { lat: string; lon: string }[];
          if (json[0]) { lat = Number(json[0].lat); lng = Number(json[0].lon); }
        } else console.error("Geocode failed", res.status, await res.text());
      } catch (e) { console.error("Geocode error", e); }
      if (lat != null && lng != null) {
        // RLS decides whether this user may save the coordinates.
        if (item.kind === "property") await context.supabase.from("properties").update({ lat, lng }).eq("id", item.id);
        else await context.supabase.from("crews").update({ start_lat: lat, start_lng: lng }).eq("id", item.id);
      }
      out.push({ id: item.id, kind: item.kind, lat, lng });
    }
    return out;
  });
