-- 17_facility_kit.sql  (step 68a)
--
-- ONE table for "who may use which tool" and ONE table for "what was done", for every tool of the search bar (the employee manager and the PAX editor now, the other tools later).
-- Until step 68b / 68c the two tools still write to their own tables, so NOTHING CHANGES ON SCREEN with this file.
--
-- It is safe to run more than once: the tables are created only if missing, and the copy of the existing rows below can be repeated at any time (each old row is copied once, marked in `legacy_ref`).
-- Run it in the Supabase SQL editor (the whole file at once). The last SELECT shows the old and the new counts: they must match.

-- ---- who may use which tool ----
CREATE TABLE IF NOT EXISTS public.facility_delegate (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility          text        NOT NULL CHECK (facility ~ '^[a-z][a-z_]{1,30}$'),   -- 'employee', 'pax', later 'holiday', 'circular', 'announcement', 'access_log'
  ticket_no         text        NOT NULL CHECK (ticket_no ~ '^4[0-9]{5}$'),          -- an executive: a six-digit ticket that starts with 4
  name              text        NOT NULL,
  granted_by_ticket text        NOT NULL,
  granted_by_name   text        NOT NULL,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_by_ticket text,
  revoked_by_name   text,
  legacy_ref        text,                                                             -- 'employee_admin_delegate#12': the old row this one was copied from (empty for rows made here)
  CHECK ((revoked_at IS NULL) = (revoked_by_ticket IS NULL))
);
-- one ACTIVE authorisation per person and tool (a withdrawn one stays as history, and the person can be authorised again)
CREATE UNIQUE INDEX IF NOT EXISTS facility_delegate_one_active ON public.facility_delegate (facility, ticket_no) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facility_delegate_legacy ON public.facility_delegate (legacy_ref) WHERE legacy_ref IS NOT NULL;

-- ---- what was done (append only) ----
CREATE TABLE IF NOT EXISTS public.facility_audit (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  facility      text        NOT NULL CHECK (facility ~ '^[a-z][a-z_]{1,30}$'),
  actor_ticket  text        NOT NULL,
  actor_name    text        NOT NULL,
  actor_role    text        NOT NULL CHECK (actor_role IN ('hod', 'delegate')),
  action        text        NOT NULL CHECK (action ~ '^[a-z][a-z_]{1,30}$'),           -- add, modify, delete, grant, revoke now; publish, seed, clear ... later
  target_id     integer,                    -- the row concerned (the roster row, the PAX line ...), kept even after the row is deleted
  target_ticket text,                       -- the person concerned (an employee changed, or the executive authorised / withdrawn)
  target_name   text,
  before        jsonb,
  after         jsonb,
  note          text,
  legacy_ref    text                        -- 'pax_directory_audit#7': the old row this one was copied from
);
CREATE INDEX IF NOT EXISTS facility_audit_at ON public.facility_audit (facility, at DESC);
CREATE INDEX IF NOT EXISTS facility_audit_target ON public.facility_audit (facility, target_ticket);
CREATE INDEX IF NOT EXISTS facility_audit_target_id ON public.facility_audit (facility, target_id) WHERE target_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facility_audit_legacy ON public.facility_audit (legacy_ref) WHERE legacy_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.facility_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'facility_audit is append only';
END;
$f$;
DROP TRIGGER IF EXISTS facility_audit_no_change ON public.facility_audit;
CREATE TRIGGER facility_audit_no_change BEFORE UPDATE OR DELETE ON public.facility_audit FOR EACH ROW EXECUTE FUNCTION public.facility_audit_immutable();

-- nobody but the application's own connection can touch them
ALTER TABLE public.facility_delegate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_audit    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facility_delegate, public.facility_audit FROM anon, authenticated;

-- ---- copy what the two tools already hold (repeatable: each old row is copied once) ----
DO $copy$
BEGIN
  IF to_regclass('public.employee_admin_delegate') IS NOT NULL THEN
    INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name, granted_at, revoked_at, revoked_by_ticket, revoked_by_name, legacy_ref)
    SELECT 'employee', ticket_no, name, granted_by_ticket, granted_by_name, granted_at, revoked_at, revoked_by_ticket, revoked_by_name, 'employee_admin_delegate#' || id
      FROM public.employee_admin_delegate ORDER BY id
    ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;
  END IF;
  IF to_regclass('public.pax_delegate') IS NOT NULL THEN
    INSERT INTO public.facility_delegate (facility, ticket_no, name, granted_by_ticket, granted_by_name, granted_at, revoked_at, revoked_by_ticket, revoked_by_name, legacy_ref)
    SELECT 'pax', ticket_no, name, granted_by_ticket, granted_by_name, granted_at, revoked_at, revoked_by_ticket, revoked_by_name, 'pax_delegate#' || id
      FROM public.pax_delegate ORDER BY id
    ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;
  END IF;
  IF to_regclass('public.employee_admin_audit') IS NOT NULL THEN
    INSERT INTO public.facility_audit (at, facility, actor_ticket, actor_name, actor_role, action, target_id, target_ticket, target_name, before, after, note, legacy_ref)
    SELECT at, 'employee', actor_ticket, actor_name, actor_role, action, employee_id, target_ticket, target_name, before, after, note, 'employee_admin_audit#' || id
      FROM public.employee_admin_audit ORDER BY at, id
    ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;
  END IF;
  IF to_regclass('public.pax_directory_audit') IS NOT NULL THEN
    INSERT INTO public.facility_audit (at, facility, actor_ticket, actor_name, actor_role, action, target_id, target_ticket, target_name, before, after, note, legacy_ref)
    SELECT at, 'pax', actor_ticket, actor_name, actor_role, action, pax_id, target_ticket, NULL, before, after, note, 'pax_directory_audit#' || id
      FROM public.pax_directory_audit ORDER BY at, id
    ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;
  END IF;
END
$copy$;

-- ---- the check: old and new counts must match (employee and pax, delegates and history) ----
SELECT 'employee' AS tool,
       (SELECT count(*) FROM public.employee_admin_delegate) AS old_delegates, (SELECT count(*) FROM public.facility_delegate WHERE facility = 'employee') AS new_delegates,
       (SELECT count(*) FROM public.employee_admin_audit)    AS old_history,   (SELECT count(*) FROM public.facility_audit    WHERE facility = 'employee') AS new_history
UNION ALL
SELECT 'pax',
       (SELECT count(*) FROM public.pax_delegate), (SELECT count(*) FROM public.facility_delegate WHERE facility = 'pax'),
       (SELECT count(*) FROM public.pax_directory_audit), (SELECT count(*) FROM public.facility_audit WHERE facility = 'pax');
