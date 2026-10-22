import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell, PricingGrid } from "@/components/marketing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — LawnOffice" },
      { name: "description", content: "LawnOffice plans for solo operators, growing crews and established landscaping companies." },
      { property: "og:title", content: "LawnOffice pricing" },
      { property: "og:description", content: "Starter, Growth and Pro plans with a 14-day free trial." },
    ],
  }),
  component: () => (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-4xl font-extrabold sm:text-5xl">Pricing that grows with your crew</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">Start free for 14 days. Change or cancel your plan anytime.</p>
        <div className="mt-10"><PricingGrid /></div>
      </section>
    </MarketingShell>
  ),
});
