-- 30_password_policy.sql
--
-- What I keep about a password's life: when it was last changed (for the 180-day rule), the 5 passwords before it (so they cannot be used again), and the one-time codes of the OTP password change (built, switched
-- off until PASSWORD_OTP=on on the host). The application creates these tables by itself on first use if its database login may (src/lib/security/passwordStore.ts); running this file is the clean way.
-- I keep them closed to the browser: row level security on, nothing granted to anon or authenticated. The history holds bcrypt hashes (as private as the account's own password): do not copy this table anywhere.
-- Safe to run more than once. To start the 180 days again for everybody:  DELETE FROM public.password_meta;   (each person's clock then begins at his next sign-in; his history is lost)

CREATE TABLE IF NOT EXISTS public.password_meta (
  ticket_no  text        PRIMARY KEY,
  changed_at timestamptz NOT NULL,
  history    jsonb       NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS public.password_otp (
  ticket_no  text        PRIMARY KEY,
  code_hash  text        NOT NULL,
  expires_at timestamptz NOT NULL,
  tries      integer     NOT NULL DEFAULT 0,
  sent_at    timestamptz NOT NULL,
  channel    text        NOT NULL,
  sent_to    text        NOT NULL
);
CREATE TABLE IF NOT EXISTS public.password_otp_log (
  ticket_no text        NOT NULL,
  sent_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS password_otp_log_ticket_idx ON public.password_otp_log (ticket_no, sent_at);

ALTER TABLE public.password_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_otp_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_meta FROM anon, authenticated;
REVOKE ALL ON public.password_otp FROM anon, authenticated;
REVOKE ALL ON public.password_otp_log FROM anon, authenticated;

SELECT count(*) AS people_with_a_recorded_change FROM public.password_meta;
