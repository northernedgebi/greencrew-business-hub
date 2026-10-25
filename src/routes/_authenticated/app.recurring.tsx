import { createFileRoute, redirect } from "@tanstack/react-router";

// Recurring plans live on the combined Schedule page. This route keeps old /app/recurring links working.
export const Route = createFileRoute("/_authenticated/app/recurring")({
  beforeLoad: () => {
    throw redirect({ to: "/app/schedule", replace: true });
  },
});
