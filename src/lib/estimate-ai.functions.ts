import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Draft = z.object({
  title: z.string(),
  scope_notes: z.string(),
  items: z.array(z.object({
    description: z.string(),
    catalog_service: z.string().nullable(),
    service_kind: z.enum(["lawn", "snow_plowing", "snow_removal", "shoveling", "other"]),
    quantity: z.number(),
    unit_price: z.number(),
  })),
});
export type EstimateDraft = z.infer<typeof Draft>;

/** Turns an office description of a customer request into an itemized estimate draft using the company's own service catalog. */
export const draftEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { companyId: string; description: string }) => {
    const description = String(i?.description ?? "").trim().slice(0, 4000);
    if (!description) throw new Error("Describe the request first");
    return { companyId: String(i.companyId), description };
  })
  .handler(async ({ data, context }) => {
    const { data: office } = await context.supabase.rpc("is_office", { _company: data.companyId });
    if (!office) throw new Error("Only office staff can draft estimates");
    const [plans, jobs] = await Promise.all([
      context.supabase.from("recurring_plans").select("service,service_kind,price").eq("company_id", data.companyId).limit(300),
      context.supabase.from("jobs").select("title,service_kind,price").eq("company_id", data.companyId).order("created_at", { ascending: false }).limit(300),
    ]);
    const map = new Map<string, { name: string; kind: string; prices: number[] }>();
    for (const r of [...(plans.data ?? []).map(p => ({ name: p.service, kind: p.service_kind, price: Number(p.price) })), ...(jobs.data ?? []).map(j => ({ name: j.title, kind: j.service_kind, price: Number(j.price) }))]) {
      const k = r.name.trim().toLowerCase(); if (!k) continue;
      const e = map.get(k) ?? { name: r.name.trim(), kind: r.kind, prices: [] }; e.prices.push(r.price); map.set(k, e);
    }
    const catalog = [...map.values()].slice(0, 80).map(e => `- ${e.name} (${e.kind}) typical $${(e.prices.reduce((a, b) => a + b, 0) / e.prices.length).toFixed(2)}`).join("\n") || "(no services yet)";

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output } = await import("ai");
    const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        output: Output.object({ schema: Draft }),
        system: `You draft itemized estimates for a landscaping and snow-removal company. Split the request into separate billable line items. Match each item to the company's catalog when it fits (set catalog_service to the exact catalog name and use its typical price); otherwise set catalog_service null and give a fair market price in USD. Quantity is visits or units. Keep descriptions short. title is a short estimate title; scope_notes summarizes the scope and assumptions.\n\nCompany catalog:\n${catalog}`,
        prompt: data.description,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const out = await result.output;
      return { ...out, items: out.items.map(i => ({ ...i, quantity: Math.max(1, i.quantity), unit_price: Math.max(0, Math.round(i.unit_price * 100) / 100) })) };
    } catch (e) {
      console.error("draftEstimate failed", e);
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 402) throw new Error("AI credits are used up. Add credits in Settings → Plans & credits.");
      if (status === 429) throw new Error("AI is busy right now. Try again in a minute.");
      throw new Error("Couldn't draft the estimate. Try rewording or enter it manually.");
    }
  });
