import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/marketing";

type Search = { mode?: "signup" | "signin"; plan?: string | undefined };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s["mode"] === "signup" ? "signup" : "signin",
    plan: typeof s["plan"] === "string" ? s["plan"] : undefined,
  }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Sign in — LawnOffice" },
      { name: "description", content: "Sign in or create your LawnOffice account." },
      { property: "og:title", content: "Sign in to LawnOffice" },
      { property: "og:description", content: "Access your landscaping company workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, plan } = Route.useSearch();
  const navigate = useNavigate();
  const isSignup = mode === "signup";
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    if (plan) sessionStorage.setItem("lawnoffice.plan", plan);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [plan, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { emailRedirectTo: window.location.origin + "/app", data: { full_name: form.name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/app" });
        else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) return toast.error(r.error.message ?? "Google sign-in failed");
    if (r.redirected) return;
    navigate({ to: "/app" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-hero px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl sm:p-8">
        <Link to="/"><Logo /></Link>
        {sent ? (
          <div className="mt-8">
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="mt-2 text-muted-foreground">We sent a confirmation link to {form.email}. Open it to finish creating your account.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-2xl font-bold">{isSignup ? "Create your account" : "Welcome back"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{isSignup ? "Start your 14-day free trial." : "Sign in to your workspace."}</p>
            <Button type="button" variant="outline" size="lg" className="mt-6 w-full" onClick={google}>Continue with Google</Button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
            <form onSubmit={submit} className="space-y-4">
              {isSignup && (
                <div className="space-y-1.5"><Label htmlFor="name">Your name</Label>
                  <Input id="name" className="h-12" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              )}
              <div className="space-y-1.5"><Label htmlFor="email">Email</Label>
                <Input id="email" type="email" className="h-12" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="password">Password</Label>
                <Input id="password" type="password" className="h-12" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}</Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account? " : "New to LawnOffice? "}
              <Link to="/auth" search={{ mode: isSignup ? "signin" : "signup" }} className="font-semibold text-primary">{isSignup ? "Sign in" : "Create one"}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
