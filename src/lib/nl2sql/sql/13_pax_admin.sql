-- 13_pax_admin.sql : the PAX admin panel (step 64a). Run ONCE in the Supabase SQL editor. It only ADDS two tables; public.pax_directory is not changed.
--   pax_delegate        the executives the HOD C&IT has authorised to change PAX numbers (a revoked line is kept, with who revoked it and when)
--   pax_directory_audit one line for every add, change, delete, authorisation and revocation, with who did it (ticket and name from the login) and the line before and after. APPEND ONLY.
-- Like pax_directory, both are closed to the public API roles: only the application's own connection reads and writes them.

CREATE TABLE IF NOT EXISTS public.pax_delegate (
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
-- an executive is authorised at most once at a time
CREATE UNIQUE INDEX IF NOT EXISTS pax_delegate_one_active ON public.pax_delegate (ticket_no) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pax_directory_audit (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_ticket  text        NOT NULL,
  actor_name    text        NOT NULL,
  actor_role    text        NOT NULL CHECK (actor_role IN ('hod', 'delegate')),
  action        text        NOT NULL CHECK (action IN ('add', 'modify', 'delete', 'grant', 'revoke')),
  pax_id        integer,                    -- the line changed (kept even after the line is deleted)
  target_ticket text,                       -- for grant / revoke: the executive concerned
  before        jsonb,
  after         jsonb,
  note          text
);
CREATE INDEX IF NOT EXISTS pax_directory_audit_at ON public.pax_directory_audit (at DESC);

-- the history cannot be changed or erased, not even by the application
CREATE OR REPLACE FUNCTION public.pax_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'pax_directory_audit is append only';
END;
$f$;
DROP TRIGGER IF EXISTS pax_audit_no_change ON public.pax_directory_audit;
CREATE TRIGGER pax_audit_no_change BEFORE UPDATE OR DELETE ON public.pax_directory_audit FOR EACH ROW EXECUTE FUNCTION public.pax_audit_immutable();

ALTER TABLE public.pax_delegate        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pax_directory_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pax_delegate, public.pax_directory_audit FROM anon, authenticated;
