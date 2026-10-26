import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string | undefined; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string | undefined; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-card p-4 shadow-soft sm:p-5 ${className}`}>{children}</div>;
}

const TONES: Record<string, string> = {
  scheduled: "bg-secondary text-secondary-foreground",
  in_progress: "bg-warning/20 text-foreground",
  completed: "bg-success/15 text-primary",
  cancelled: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary text-secondary-foreground",
  partial: "bg-warning/20 text-foreground",
  paid: "bg-success/15 text-primary",
  void: "bg-muted text-muted-foreground line-through",
  overdue: "bg-destructive/15 text-destructive",
  accepted: "bg-success/15 text-primary",
  declined: "bg-destructive/15 text-destructive",
  active: "bg-success/15 text-primary",
  inactive: "bg-destructive/15 text-destructive",
  on_hold: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={`border-0 capitalize ${TONES[status] ?? ""}`}>{status.replace("_", " ")}</Badge>;
}

export function Spinner() {
  return <div className="grid min-h-[40vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
}
