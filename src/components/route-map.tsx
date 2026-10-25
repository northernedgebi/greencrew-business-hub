import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapStop = { id: string; n: number; lat: number; lng: number; label: string };

export default function RouteMap({ start, stops }: { start: { lat: number; lng: number } | null; stops: MapStop[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([39.5, -98.35], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    if (start) {
      pts.push([start.lat, start.lng]);
      L.marker([start.lat, start.lng], { icon: L.divIcon({ className: "", html: `<div class="route-pin route-pin-start">★</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindPopup("Crew start").addTo(g);
    }
    for (const s of stops) {
      pts.push([s.lat, s.lng]);
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: `<div class="route-pin">${s.n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .bindPopup(`${s.n}. ${s.label.replace(/</g, "&lt;")}`).addTo(g);
    }
    if (start && stops.length) pts.push([start.lat, start.lng]);
    if (pts.length > 1) L.polyline(pts, { color: "var(--color-primary)", weight: 4, opacity: 0.8 }).addTo(g);
    if (pts.length) m.fitBounds(L.latLngBounds(pts as L.LatLngTuple[]).pad(0.2), { maxZoom: 15 });
    setTimeout(() => m.invalidateSize(), 50);
  }, [start, stops]);

  return <div ref={el} className="h-[360px] w-full overflow-hidden rounded-2xl border md:h-[480px]" />;
}
