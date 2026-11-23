-- 28_announcement_file.sql
--
-- The PDF of an announcement (src/lib/announcements/attachment.ts, src/lib/announcements/admin/files.ts): one row for each announcement that carries a PDF, with or without body text. The PDF itself is in Vercel
-- Blob; this table keeps its address (which is never sent to the browser: the file is served by /api/announcements/<id>/file), its name and its size.
--
-- I made it a table of its own, and not columns of public.announcement, so that the announcements keep working whether or not this file has been run: nothing that reads an announcement needs it.
-- Safe to run more than once. The application also creates this table by itself the first time a PDF is attached, if its database user may; running this file is the clean way.
-- Deleting an announcement deletes its row here (ON DELETE CASCADE); the application deletes the PDF from Blob.

CREATE TABLE IF NOT EXISTS public.announcement_file (
  announcement_id  integer       PRIMARY KEY REFERENCES public.announcement(id) ON DELETE CASCADE,
  url              text          NOT NULL,                       -- the address in Vercel Blob (server side only)
  name             varchar(255)  NOT NULL,                       -- the name shown and given on download, ending in .pdf
  bytes            integer       NOT NULL CHECK (bytes > 0),
  uploaded_at      timestamptz   NOT NULL DEFAULT now(),
  uploaded_by      varchar(20)   NOT NULL                        -- the ticket of the person who attached it
);

ALTER TABLE public.announcement_file ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_file FROM anon, authenticated;

SELECT announcement_id, name, bytes, uploaded_at FROM public.announcement_file ORDER BY announcement_id DESC LIMIT 10;
