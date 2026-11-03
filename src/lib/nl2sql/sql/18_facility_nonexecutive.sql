-- 18_facility_nonexecutive.sql  (step 69c)
--
-- A tool can now be given to a NON-EXECUTIVE too (the HOD confirms it in the screen: "are you sure you want to authorise a non-executive?"). Step 68a limited facility_delegate.ticket_no to an
-- executive's ticket (six digits starting with 4); this file widens it to any employee's ticket: six digits, not starting with 0. Nothing else changes: the rows that exist stay as they are.
-- Safe to run more than once. Run it in the Supabase SQL editor (the whole file at once); the last SELECT shows the rule now in force.

ALTER TABLE public.facility_delegate DROP CONSTRAINT IF EXISTS facility_delegate_ticket_no_check;
ALTER TABLE public.facility_delegate ADD CONSTRAINT facility_delegate_ticket_no_check CHECK (ticket_no ~ '^[1-9][0-9]{5}$');

SELECT conname AS rule, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.facility_delegate'::regclass AND conname = 'facility_delegate_ticket_no_check';
