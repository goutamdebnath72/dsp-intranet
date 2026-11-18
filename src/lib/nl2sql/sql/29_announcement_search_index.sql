-- 29_announcement_search_index.sql
--
-- THE SEARCH INDEX OF AN ANNOUNCEMENT (src/lib/announcements/searchIndex/): prepared the way a circular is prepared, for the search bar to find an announcement by its title, by its BODY TEXT and by what its PDF says.
--
--   announcement_chunk   the passages (about 200 words each) with a vector (768, the same Gemini embedding as circulars): source 'body' = the announcement's own text; source 'pdf' = the PDF, by page.
--   announcement_page    the picture of each page of the PDF (kept in Vercel Blob, as circulars keep theirs; the address is never sent to the browser: /api/announcements/<id>/page/<n> serves it).
--   announcement_index   one row per announcement: how each part went (ready | failed, and why), how many pages came from the PDF's own text and how many had to be read by AI (OCR), and the PDF's whole text
--                        (used for the announcement's own vector and for the answers drawn from it).
--
-- A true PDF is read from its own text layer (exact, free); a page with no usable text layer (a scan, an infographic) is read by Gemini, exactly as a circular's pages are.
-- Tables of their own, so that announcements and their PDFs work whether or not this file has been run (the search then finds titles and body words only).
-- Safe to run more than once. The application also creates the tables by itself the first time something is indexed, if its database user may; running this file is the clean way.
-- Deleting an announcement deletes its rows here (ON DELETE CASCADE); the application deletes the page pictures from Blob.

CREATE TABLE IF NOT EXISTS public.announcement_index (
  announcement_id  integer       PRIMARY KEY REFERENCES public.announcement(id) ON DELETE CASCADE,
  pdf_status       varchar(10)   CHECK (pdf_status IN ('ready', 'failed')),     -- null = no PDF has been read for it
  pdf_note         text,                                                         -- why it failed, or which pages could not be read
  pdf_pages        integer,                                                      -- pages that have text
  pdf_text_pages   integer,                                                      -- ... of which taken from the PDF's own text
  pdf_ocr_pages    integer,                                                      -- ... and read by AI (a page without a usable text layer)
  pdf_text         text,                                                         -- the whole text of the PDF
  body_status      varchar(10)   CHECK (body_status IN ('ready', 'failed')),    -- null = no body text
  body_note        text,
  body_chunks      integer,
  indexed_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcement_chunk (
  id               serial        PRIMARY KEY,
  announcement_id  integer       NOT NULL REFERENCES public.announcement(id) ON DELETE CASCADE,
  source           varchar(4)    NOT NULL CHECK (source IN ('body', 'pdf')),
  chunk_index      integer       NOT NULL,
  page             integer,                                                      -- 1-based page of the PDF (0 or null for the body)
  text             text          NOT NULL,
  embedding        vector(768)
);
CREATE INDEX IF NOT EXISTS announcement_chunk_announcement_idx ON public.announcement_chunk (announcement_id);

CREATE TABLE IF NOT EXISTS public.announcement_page (
  announcement_id  integer       NOT NULL REFERENCES public.announcement(id) ON DELETE CASCADE,
  page             integer       NOT NULL CHECK (page >= 1),
  url              text          NOT NULL,                                       -- the picture in Vercel Blob (server side only)
  PRIMARY KEY (announcement_id, page)
);

ALTER TABLE public.announcement_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_page ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_index FROM anon, authenticated;
REVOKE ALL ON public.announcement_chunk FROM anon, authenticated;
REVOKE ALL ON public.announcement_page FROM anon, authenticated;

SELECT announcement_id, pdf_status, pdf_pages, pdf_ocr_pages, body_status, body_chunks, indexed_at FROM public.announcement_index ORDER BY announcement_id DESC LIMIT 10;
