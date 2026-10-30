import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Users, Receipt, Route as RouteIcon, Repeat, Smartphone, ShieldCheck, BarChart3, ArrowRight, CheckCircle2 } from "lucide-react";
import heroImg from "@/assets/year-round-services.jpg";
import { Button } from "@/components/ui/button";
import { Logo, MarketingShell, PricingGrid } from "@/components/marketing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "BillMyJobs.com — Year-round property service management" },
      { name: "description", content: "Manage landscaping, snow plowing, sprinklers, shoveling and construction work with crew scheduling, job tracking and billing in one workspace." },
      { property: "og:title", content: "BillMyJobs.com — Year-round property service management" },
      { property: "og:description", content: "One workspace for your customers, year-round services, crew schedules, job progress and invoices." },
    ],
  }),
  component: Home,
});

const FEATURES = [
  { icon: Users, title: "Customer CRM", text: "Every customer, property, gate code and note in one place." },
  { icon: CalendarDays, title: "Scheduling & dispatch", text: "Assign visits to crews and see the day at a glance." },
  { icon: Repeat, title: "Year-round services", text: "Recurring lawn care, seasonal maintenance and snow visits as storms arrive." },
  { icon: Receipt, title: "Invoices & payments", text: "Turn finished work into invoices and track every dollar." },
  { icon: RouteIcon, title: "Route planning", text: "Sequence stops so crews spend time mowing, not driving." },
  { icon: BarChart3, title: "Financial reports", text: "Revenue, outstanding balances and crew performance." },
  { icon: Smartphone, title: "Works in the field", text: "Big buttons and a phone-first layout your crews will use." },
  { icon: ShieldCheck, title: "Private workspace", text: "Your company's data is isolated and permissioned by role." },
];

function Home() {
  return (
    <MarketingShell hideHeaderLogo>
      <section className="relative isolate overflow-hidden bg-forest text-forest-foreground">
        <img src={heroImg} alt="Lawn mowing, snow plowing, sprinkler maintenance, snow shoveling and landscape construction crews" width={1920} height={1024} fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-hero-overlay" />
        <div className="mx-auto flex min-h-[460px] max-w-6xl flex-col justify-center px-4 py-8 sm:min-h-[500px]">
          <div className="w-full max-w-3xl text-left">
            <h1 className="w-full max-w-md"><Logo light className="!w-full" /><span className="sr-only">BillMyJobs.com</span></h1>
            <p className="mt-3 text-xl font-semibold sm:text-2xl">Your whole operation. Every service. Every season.</p>
            <p className="mt-3 max-w-xl text-base text-forest-foreground/90 sm:text-lg">From mowing and sprinkler systems to snow plowing, shoveling and construction — keep customers, crews, schedules and billing together.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="lime" size="lg"><Link to="/auth" search={{ mode: "signup" }}>Start your 14-day trial</Link></Button>
              <Button asChild variant="heroOutline" size="lg"><Link to="/pricing">See pricing</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-card py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-bold">A clear view from the office to the field.</h2>
            <span className="text-xs font-semibold uppercase text-muted-foreground">Example workspace</span>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarDays className="size-5 text-primary" /> Scheduling</h3>
              <div className="mb-2 flex justify-between text-xs font-semibold text-muted-foreground"><span>MONDAY, NOVEMBER 2</span><span>CREW</span></div>
              {[['8:00', 'Sprinkler blowout', 'North'], ['9:30', 'Fall cleanup', 'North'], ['11:00', 'Walkway construction', 'West']].map(([time, task, crew]) => <div key={task} className="flex items-center gap-3 border-t py-3 text-sm"><span className="w-10 shrink-0 text-muted-foreground">{time}</span><span className="flex-1 font-semibold">{task}</span><span className="text-muted-foreground">{crew}</span></div>)}
            </div>
            <div className="md:border-l md:pl-8">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><RouteIcon className="size-5 text-primary" /> Job tracking</h3>
              <div className="flex items-baseline gap-2"><span className="text-3xl font-bold">8 of 12</span><span className="text-sm text-muted-foreground">visits complete</span></div>
              <div className="my-4 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-2/3 bg-primary" /></div>
              <div className="flex justify-between border-t py-3 text-sm"><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> North crew</span><span className="font-semibold">2 stops left</span></div>
              <div className="flex justify-between border-t py-3 text-sm"><span className="flex items-center gap-2"><ArrowRight className="size-4 text-primary" /> West crew</span><span className="font-semibold">2 stops left</span></div>
            </div>
            <div className="md:border-l md:pl-8">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><Receipt className="size-5 text-primary" /> Billing</h3>
              <div className="flex items-baseline gap-2"><span className="text-3xl font-bold">$4,850</span><span className="text-sm text-muted-foreground">collected this month</span></div>
              <div className="mt-4 flex justify-between border-t py-3 text-sm"><span>Invoice #1042 · Lawn care</span><span className="font-semibold text-primary">Paid</span></div>
              <div className="flex justify-between border-t py-3 text-sm"><span>Invoice #1043 · Snow service</span><span className="font-semibold">$240 due</span></div>
              <p className="mt-1 text-xs text-muted-foreground">Monthly bills · Per-visit charges · Payment history</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">Everything your property service business runs on.</h2>
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
