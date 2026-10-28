import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/winter")({
  beforeLoad: () => { throw redirect({ to: "/app/customers" }); },
});
