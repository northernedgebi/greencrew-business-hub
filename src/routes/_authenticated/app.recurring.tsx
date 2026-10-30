import { createFileRoute, redirect } from "@tanstack/react-router";

// Recurring plans live on the combined Schedule page. This route keeps old /app/recurring links working.
export const Route = createFileRoute("/_authenticated/app/recurring")({
  head: () => ({ meta: [
    { title: "Recurring services — BillMyJobs.com" },
    { name: "description", content: "Manage recurring property services in your shared schedule." },
    { property: "og:title", content: "Recurring services — BillMyJobs.com" },
    { property: "og:description", content: "Recurring property services and crew scheduling." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/app/schedule", replace: true });
  },
});
