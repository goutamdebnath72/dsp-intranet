-- 19_employee_photo.sql  (step 70)
--
-- The photo of an employee (optional): the table holds only WHERE the two pictures are kept (the large and the small one, in Vercel Blob) and which version is current; the pictures themselves are not in the database.
-- It has no foreign key to the roster on purpose (a roster row removed by a script must never be blocked by a photo; the screen deletes the photo with the employee).
-- Safe to run more than once. Run it in the Supabase SQL editor (the whole file at once).

CREATE TABLE IF NOT EXISTS public.employee_photo (
  employee_id       integer     PRIMARY KEY,                 -- employee_roster.id
  version           integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  master_url        text        NOT NULL,                    -- the large square (up to 1000 px)
  thumb_url         text        NOT NULL,                    -- the small square (160 px)
  width             integer     NOT NULL,
  height            integer     NOT NULL,
  bytes             integer     NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by_ticket text        NOT NULL,
  updated_by_name   text        NOT NULL
);
ALTER TABLE public.employee_photo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_photo FROM anon, authenticated;

SELECT count(*) AS photos_saved FROM public.employee_photo;
