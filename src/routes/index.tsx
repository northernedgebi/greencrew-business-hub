import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Users, Receipt, Route as RouteIcon, Repeat, Smartphone, ShieldCheck, BarChart3 } from "lucide-react";
import heroImg from "@/assets/hero-lawn.jpg";
import { Button } from "@/components/ui/button";
import { MarketingShell, PricingGrid } from "@/components/marketing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "LawnOffice — Run your landscaping business from one place" },
      { name: "description", content: "Scheduling, crews, recurring mowing, estimates, invoicing and automatic billing for landscaping companies." },
      { property: "og:title", content: "LawnOffice — Landscaping business software" },
      { property: "og:description", content: "Customers, crews, recurring visits and billing — built for landscapers." },
    ],
  }),
  component: Home,
});

const FEATURES = [
  { icon: Users, title: "Customer CRM", text: "Every customer, property, gate code and note in one place." },
  { icon: CalendarDays, title: "Scheduling & dispatch", text: "Assign visits to crews and see the day at a glance." },
  { icon: Repeat, title: "Recurring maintenance", text: "Weekly, biweekly or monthly visits generated automatically." },
  { icon: Receipt, title: "Invoices & payments", text: "Turn finished work into invoices and track every dollar." },
  { icon: RouteIcon, title: "Route planning", text: "Sequence stops so crews spend time mowing, not driving." },
  { icon: BarChart3, title: "Financial reports", text: "Revenue, outstanding balances and crew performance." },
  { icon: Smartphone, title: "Works in the field", text: "Big buttons and a phone-first layout your crews will use." },
  { icon: ShieldCheck, title: "Private workspace", text: "Your company's data is isolated and permissioned by role." },
];

function Home() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden bg-hero text-forest-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 inline-block rounded-full bg-lime/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-lime">For landscaping companies</p>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">The office behind every perfect lawn.</h1>
            <p className="mt-5 max-w-md text-lg text-forest-foreground/75">Customers, crews, recurring visits and billing — organized in one app that works as well on the mower seat as at the desk.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="lime" size="lg"><Link to="/auth" search={{ mode: "signup" }}>Start your 14-day trial</Link></Button>
              <Button asChild variant="heroOutline" size="lg"><Link to="/pricing">See pricing</Link></Button>
            </div>
          </div>
          <img src={heroImg} alt="Landscaper mowing a striped lawn at sunset" width={1600} height={1104} className="aspect-[4/3] w-full rounded-2xl object-cover shadow-2xl" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="max-w-xl text-3xl font-extrabold sm:text-4xl">Everything a landscaping business runs on.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-soft">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Simple plans. No setup fees.</h2>
          <p className="mt-2 text-muted-foreground">Every plan starts with a 14-day free trial.</p>
          <div className="mt-10"><PricingGrid /></div>
        </div>
      </section>
    </MarketingShell>
  );
}
