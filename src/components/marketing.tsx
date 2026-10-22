import { Link } from "@tanstack/react-router";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2 font-display text-xl font-extrabold ${light ? "text-forest-foreground" : "text-foreground"}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-lime text-lime-foreground">
        <Leaf className="h-4 w-4" />
      </span>
      LawnOffice
    </span>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-sidebar-border bg-forest/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/"><Logo light /></Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link to="/pricing" className="hidden px-3 text-sm font-medium text-forest-foreground/80 hover:text-forest-foreground sm:block">Pricing</Link>
            <Link to="/auth" className="px-3 text-sm font-medium text-forest-foreground/80 hover:text-forest-foreground">Log in</Link>
            <Button asChild variant="lime" size="sm"><Link to="/auth" search={{ mode: "signup" }}>Start free trial</Link></Button>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t bg-forest py-10 text-forest-foreground/70">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center">
          <Logo light />
          <p className="text-sm">© {new Date().getFullYear()} LawnOffice. Built for the people who keep yards green.</p>
        </div>
      </footer>
    </div>
  );
}

export const PLANS = [
  { id: "starter", name: "Starter", price: 49, blurb: "Solo operators getting organized", features: ["Up to 3 team members", "Unlimited customers", "Scheduling & recurring visits", "Invoices & payments"] },
  { id: "growth", name: "Growth", price: 129, blurb: "Growing crews running multiple routes", features: ["Up to 15 team members", "Crew dispatch & route planning", "Estimates & contracts", "Automatic card billing"], featured: true },
  { id: "pro", name: "Pro", price: 249, blurb: "Established companies with an office", features: ["Unlimited team members", "Customer portal", "Payment plans", "Advanced financial reports"] },
] as const;

export function PricingGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PLANS.map((p) => (
        <div key={p.id} className={`flex flex-col rounded-2xl border p-6 shadow-soft ${"featured" in p && p.featured ? "border-primary bg-forest text-forest-foreground" : "bg-card"}`}>
          <h3 className="text-xl font-bold">{p.name}</h3>
          <p className={`mt-1 text-sm ${"featured" in p && p.featured ? "text-forest-foreground/70" : "text-muted-foreground"}`}>{p.blurb}</p>
          <p className="mt-6 font-display text-5xl font-extrabold">${p.price}<span className="text-base font-medium opacity-60">/mo</span></p>
          <ul className="mt-6 flex-1 space-y-2 text-sm">
            {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-lime">●</span>{f}</li>)}
          </ul>
          <Button asChild variant={"featured" in p && p.featured ? "lime" : "default"} size="lg" className="mt-8 w-full">
            <Link to="/auth" search={{ mode: "signup", plan: p.id }}>Start 14-day trial</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
