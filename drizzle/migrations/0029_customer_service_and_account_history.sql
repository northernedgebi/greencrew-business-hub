ALTER TABLE public.customers ADD COLUMN history_account_status text NOT NULL DEFAULT 'active';
UPDATE public.customers c SET history_account_status=CASE WHEN c.status<>'active' THEN 'inactive' WHEN (SELECT coalesce(sum(greatest(i.total-i.amount_paid,0)),0) FROM public.invoices i WHERE i.customer_id=c.id AND i.company_id=c.company_id AND i.status NOT IN ('draft','void') AND i.due_date<current_date)>coalesce(c.overdue_hold_limit,0) THEN 'on_hold' ELSE 'active' END;
CREATE TABLE public.customer_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,actor_id uuid,action text NOT NULL,summary text NOT NULL,before_values jsonb,after_values jsonb,effective_date date NOT NULL DEFAULT current_date,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_history TO authenticated;
GRANT ALL ON public.customer_history TO service_role;
ALTER TABLE public.customer_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY office_reads_customer_history ON public.customer_history FOR SELECT TO authenticated USING(public.can_read_company(company_id));
CREATE INDEX customer_history_customer_idx ON public.customer_history(customer_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.refresh_customer_history_state(_customer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.customers%ROWTYPE; owed numeric; state text; effective date;
BEGIN
 SELECT * INTO c FROM public.customers WHERE id=_customer FOR UPDATE; IF NOT FOUND THEN RETURN; END IF;
 SELECT coalesce(sum(greatest(total-amount_paid,0)),0), min(due_date+1) INTO owed,effective FROM public.invoices WHERE customer_id=c.id AND company_id=c.company_id AND status NOT IN ('draft','void') AND due_date<current_date AND total>amount_paid;
 state:=CASE WHEN c.status<>'active' THEN 'inactive' WHEN owed>coalesce(c.overdue_hold_limit,0) THEN 'on_hold' ELSE 'active' END;
 IF state IS DISTINCT FROM c.history_account_status THEN
 INSERT INTO public.customer_history(company_id,customer_id,actor_id,action,summary,before_values,after_values,effective_date) VALUES(c.company_id,c.id,auth.uid(),'account_state',CASE WHEN state='on_hold' THEN 'Suspended for overdue bills' WHEN state='active' THEN 'Customer active / billing hold cleared' ELSE 'Customer inactive' END,jsonb_build_object('status',c.history_account_status),jsonb_build_object('status',state,'overdue_balance',owed,'reason',c.inactive_reason),CASE WHEN state='on_hold' THEN coalesce(effective,current_date) ELSE current_date END);
 UPDATE public.customers SET history_account_status=state WHERE id=c.id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_customer_history_state(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.sync_customer_history(_customer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=_customer AND public.can_read_company(company_id)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM public.refresh_customer_history_state(_customer);
END $$;
REVOKE ALL ON FUNCTION public.sync_customer_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_customer_history(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.audit_customer_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE oldj jsonb; newj jsonb; cid uuid; comp uuid; label text;
BEGIN
 IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD); END IF; IF TG_OP<>'DELETE' THEN newj:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='customers' THEN
 IF TG_OP='UPDATE' AND (oldj-ARRAY['history_account_status'])=(newj-ARRAY['history_account_status']) THEN RETURN NEW; END IF;
 cid:=coalesce(NEW.id,OLD.id); comp:=coalesce(NEW.company_id,OLD.company_id); label:='Customer details changed';
 IF TG_OP='UPDATE' AND (OLD.status,OLD.inactive_reason) IS DISTINCT FROM (NEW.status,NEW.inactive_reason) THEN label:=CASE WHEN NEW.status='active' THEN 'Customer reactivated' ELSE 'Customer deactivated: '||coalesce(NEW.inactive_reason,'Inactive') END; END IF;
 ELSE
 IF TG_OP='UPDATE' AND oldj=newj THEN RETURN NEW; END IF;
 cid:=coalesce(NEW.customer_id,OLD.customer_id); comp:=coalesce(NEW.company_id,OLD.company_id);
 label:=CASE WHEN TG_TABLE_NAME='recurring_plans' THEN 'Service ' ELSE 'Visit ' END||CASE TG_OP WHEN 'INSERT' THEN 'added: ' WHEN 'DELETE' THEN 'removed: ' ELSE 'changed: ' END||coalesce(newj->>'service',oldj->>'service',newj->>'title',oldj->>'title','');
 END IF;
 INSERT INTO public.customer_history(company_id,customer_id,actor_id,action,summary,before_values,after_values) SELECT comp,cid,auth.uid(),TG_TABLE_NAME||'_'||lower(TG_OP),label,oldj,newj WHERE EXISTS(SELECT 1 FROM public.customers WHERE id=cid);
 IF TG_TABLE_NAME='customers' THEN PERFORM public.refresh_customer_history_state(cid); END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER audit_customer_record AFTER UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.audit_customer_record();
CREATE TRIGGER audit_customer_service AFTER INSERT OR UPDATE OR DELETE ON public.recurring_plans FOR EACH ROW EXECUTE FUNCTION public.audit_customer_record();
CREATE TRIGGER audit_customer_visit AFTER INSERT OR UPDATE OR DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.audit_customer_record();
CREATE OR REPLACE FUNCTION public.audit_invoice_account_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
 PERFORM public.refresh_customer_history_state(coalesce(NEW.customer_id,OLD.customer_id)); RETURN coalesce(NEW,OLD); END $$;
CREATE TRIGGER audit_invoice_state_before BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_account_state();
CREATE TRIGGER audit_invoice_state_after AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_account_state();
CREATE OR REPLACE FUNCTION public.preserve_completed_service_work() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ BEGIN
 IF TG_OP='DELETE' AND (OLD.status='completed' OR OLD.invoice_id IS NOT NULL) AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Completed or billed work must be kept for customer balances and history; cancel future visits or remove the recurring service instead'; END IF;
 RETURN OLD; END $$;
CREATE TRIGGER preserve_completed_service_work BEFORE DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.preserve_completed_service_work();