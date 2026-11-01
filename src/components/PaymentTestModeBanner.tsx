const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">Live checkout isn't set up yet. Complete go-live in the Payments tab to accept real payments.</div>;
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full rounded-md border border-accent bg-accent/40 px-4 py-2 text-center text-sm text-accent-foreground">
        All payments made in the preview are in test mode.{" "}
        <a href="https://docs.lovable.dev/features/payments#test-and-live-environments" target="_blank" rel="noopener noreferrer" className="font-medium underline">Read more</a>
      </div>
    );
  }
  return null;
}
