import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PLANS } from "@/components/marketing";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Button } from "@/components/ui/button";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { PLAN_PRICE_IDS, type SoftwarePlan } from "@/lib/software-plans";
import { createBillingPortal, createPlanCheckout } from "@/utils/payments.functions";

function Checkout({ priceId, companyId }: { priceId: string; companyId: string }) {
  const fetchClientSecret = async () => {
    const r = await createPlanCheckout({ data: { priceId, companyId, environment: getStripeEnvironment(), returnUrl: `${window.location.origin}/app/settings?checkout=done` } });
    if ("error" in r) throw new Error(r.error);
    return r.clientSecret;
  };
  return <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>;
}

export function SubscriptionBilling({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const [picked, setPicked] = useState<SoftwarePlan | null>(null);
  const sub = useQuery({
    queryKey: ["company-subscription", companyId],
    enabled: canManage,
    refetchInterval: 8000,
    queryFn: async () => (await supabase.from("company_subscriptions").select("*").eq("company_id", companyId).eq("environment", getStripeEnvironment()).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });
  if (!canManage) return <p className="mt-3 text-sm text-muted-foreground">Only the company owner can change the subscription.</p>;
  const s = sub.data;
  const live = s && ["active", "trialing", "past_due"].includes(s.status);

  async function manage() {
    const r = await createBillingPortal({ data: { companyId, environment: getStripeEnvironment(), returnUrl: window.location.href } });
    if ("error" in r) return toast.error(r.error);
    window.open(r.url, "_blank");
  }

  return (
    <div className="mt-4 space-y-3">
      <PaymentTestModeBanner />
      {live ? (
        <div className="space-y-2 text-sm">
          <p>Paid subscription: <span className="font-semibold capitalize">{s.status}</span>{s.current_period_end && <> · {s.cancel_at_period_end ? "ends" : "renews"} {new Date(s.current_period_end).toLocaleDateString()}</>}</p>
          <Button variant="outline" onClick={manage}>Manage card, plan or cancel</Button>
        </div>
      ) : picked ? (
        <div className="space-y-2">
          <Checkout priceId={PLAN_PRICE_IDS[picked]} companyId={companyId} />
          <Button variant="ghost" onClick={() => setPicked(null)}>Back to plans</Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {PLANS.map((p) => (
            <Button key={p.id} variant={"featured" in p && p.featured ? "default" : "outline"} className="h-auto justify-between py-3" onClick={() => setPicked(p.id)}>
              <span className="font-semibold">{p.name}</span><span>${p.price}/mo</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
