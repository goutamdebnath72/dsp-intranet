-- 15_employee_admin.sql : the EMPLOYEE MANAGER (step 66a; owner, 1 Nov 2026): who may add, change and delete employees, and the history of every change. Run ONCE in the Supabase SQL editor; safe to run again.
--
--   employee_admin_delegate   the executives the HOD of C&IT has authorised (and the ones he has withdrawn: the row stays, with who and when)
--   employee_admin_audit      the history: who did what to whom, and the record BEFORE and AFTER. APPEND ONLY: a trigger refuses any change or deletion of a line.
--
-- Like pax_directory, and like employee_roster itself, these tables are closed to the public API roles (anon, authenticated): only the application's own connection reads and writes them, and the AI search's
-- read-only role never sees them. The HOD of C&IT is not in a table: he is the ticket(s) of SUPERADMIN_TICKETS in the environment, so nothing in the database can promote anybody to HOD.

CREATE TABLE IF NOT EXISTS public.employee_admin_delegate (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_no         text        NOT NULL CHECK (ticket_no ~ '^4[0-9]{5}$'),      -- an executive: a six-digit ticket that starts with 4
  name              text        NOT NULL,
  granted_by_ticket text        NOT NULL,
  granted_by_name   text        NOT NULL,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_by_ticket text,
  revoked_by_name   text,
  CHECK ((revoked_at IS NULL) = (revoked_by_ticket IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_admin_delegate_one_active ON public.employee_admin_delegate (ticket_no) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_admin_audit (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_ticket  text        NOT NULL,
  actor_name    text        NOT NULL,
  actor_role    text        NOT NULL CHECK (actor_role IN ('hod', 'delegate')),
  action        text        NOT NULL CHECK (action IN ('add', 'modify', 'delete', 'grant', 'revoke')),
  employee_id   integer,                    -- the roster row changed (kept even after the row is deleted)
  target_ticket text,                       -- the employee concerned (add, modify, delete) or the executive authorised / withdrawn
  target_name   text,
  before        jsonb,
  after         jsonb,
  note          text
);
CREATE INDEX IF NOT EXISTS employee_admin_audit_at ON public.employee_admin_audit (at DESC);
CREATE INDEX IF NOT EXISTS employee_admin_audit_target ON public.employee_admin_audit (target_ticket);

CREATE OR REPLACE FUNCTION public.employee_admin_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'employee_admin_audit is append only';
END;
$f$;
DROP TRIGGER IF EXISTS employee_admin_audit_no_change ON public.employee_admin_audit;
CREATE TRIGGER employee_admin_audit_no_change BEFORE UPDATE OR DELETE ON public.employee_admin_audit FOR EACH ROW EXECUTE FUNCTION public.employee_admin_audit_immutable();

ALTER TABLE public.employee_admin_delegate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_admin_audit    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_admin_delegate, public.employee_admin_audit FROM anon, authenticated;

-- CHECK (both must say 2 columns of rules and 2 tables with row level security on):
SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('employee_admin_delegate', 'employee_admin_audit') AND rowsecurity) AS tables_with_row_level_security,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'employee_admin_audit_no_change') AS append_only_trigger;
