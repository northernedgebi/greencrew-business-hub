import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { companyStatusFromSubscription, planFromPriceId } from "@/lib/software-plans";

let _supabase: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_supabase) _supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
  return _supabase;
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

async function syncSubscription(subscription: any, env: StripeEnv) {
  const companyId = subscription.metadata?.companyId;
  if (!companyId) { console.error("No companyId on subscription", subscription.id); return; }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const status = subscription.status as string;
  await (db().from("company_subscriptions") as any).upsert({
    company_id: companyId,
    user_id: subscription.metadata?.userId ?? null,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
    product_id: typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id,
    price_id: priceId,
    status,
    current_period_start: iso(item?.current_period_start ?? subscription.current_period_start),
    current_period_end: iso(item?.current_period_end ?? subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    environment: env,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });

  // Only live payments change real company access; test checkouts update the record above.
  // In the preview (test mode) also reflect the status so the flow can be tried end to end.
  const plan = planFromPriceId(priceId);
  const update: Record<string, string> = { subscription_status: companyStatusFromSubscription(status) };
  if (plan) update["plan"] = plan;
  // Never override a platform-admin suspension.
  await (db().from("companies") as any).update(update).eq("id", companyId).neq("subscription_status", "suspended");
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") return Response.json({ received: true, ignored: "invalid env" });
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await syncSubscription(event.data.object, env);
              break;
            case "customer.subscription.deleted":
              await syncSubscription({ ...event.data.object, status: "canceled" }, env);
              break;
            default:
              console.log("Unhandled event:", event.type);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
