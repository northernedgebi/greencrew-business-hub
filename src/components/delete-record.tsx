import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type DeletableTable = "estimates" | "customers" | "properties" | "jobs" | "recurring_plans" | "invoices" | "payments" | "invoice_items" | "crews" | "employees" | "company_invites" | "company_members" | "service_requests";

export function DeleteRecord({ table, id, name, description, onDeleted }: { table: DeletableTable; id: string; name: string; description: string; onDeleted?: () => void }) {
  const { companyId } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const { data, error } = await supabase.from(table).delete().eq("company_id", companyId).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("This record was already removed or you don’t have permission to delete it.");
      await qc.invalidateQueries();
      toast.success(`${name} deleted`);
      setOpen(false);
      onDeleted?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete this record"); }
    finally { setBusy(false); }
  }
  return <AlertDialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Delete ${name}`} title={`Delete ${name}`} className="shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
    <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
      <AlertDialogHeader><AlertDialogTitle>Delete {name}?</AlertDialogTitle><AlertDialogDescription>{description} This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep record</Button><Button variant="destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete permanently"}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}