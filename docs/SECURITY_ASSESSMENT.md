# Security assessment of the DSP Intranet (21 Nov 2026)

Method: every API route listed and read for who may call it; the login, session and secrets code read; every place that reaches a database, a model, a file store or an outside address read; `npm audit`;
a secrets search of every tracked file; a production build and a running copy to see the headers. Fixes are in STATUS.md row 273. "Fixed" means changed, tested, and checked in the full test sweep.

## Found, and fixed

| # | Severity | Weakness | Fix |
|---|---|---|---|
| 1 | CRITICAL | The login password is the person's SAIL P.No., and the open directory search returned every employee's ticket AND P.No. (and searched by P.No.): anybody on the internet could sign in as anybody, the HOD included. | The P.No. is masked in every card (first and last character only); a lookup by P.No. needs a signed-in person and is decided before the database; the open search route is rate-limited. |
| 2 | HIGH | The HOD's real P.No. (his password) was in `constants.ts`, in the user manual's sample and in tests, so in the deployed page code and in git history. | Removed from code, manual and tests (a sample number is used). **The password itself must still be changed: `scripts/set-user-password.ts`.** |
| 3 | HIGH | No limit on wrong passwords; an unknown ticket was refused faster than a wrong password (tickets could be found by timing). | Wrong tries are counted by ticket+address (6), address (30), ticket (40) in 15 minutes and refused before the database; unknown tickets cost the same bcrypt work. |
| 4 | HIGH | A GitHub sign-in provider was switched on although nothing used it: anybody with a GitHub account could get a session and pass every check that asks only "is there a session". | Provider removed. |
| 5 | HIGH | The search route reached the paid model for signed-out visitors with no limit: a loop could spend the model budget. | 60 a minute per ticket, 120 per address for questions that can reach the model; 1000-character cap. |
| 6 | HIGH | Dependencies: Next 14.2.33 (2 high denial-of-service fixes exist in 14.2.34 and 14.2.35), `sanitize-html` (the announcements' XSS filter), `sharp` (image libraries), `undici`, `@vercel/blob` chain, `zod`. | Next 14.2.35, sanitize-html, sharp 0.35.5, undici, @vercel/blob 2.9.0, zod override. 11 findings down to 2 (below). |
| 7 | MEDIUM | Unmasking contact details had no cap (a signed-in person could copy the directory one reveal at a time). | 120 reveals/copies per ticket per hour, counted from the audit table (the same for every server copy). |
| 8 | MEDIUM | No security headers; the response named the framework. | HSTS, nosniff, SAMEORIGIN framing (the app's own PDF frames still work), referrer policy, permissions policy; no X-Powered-By. |
| 9 | MEDIUM | Sessions lasted 30 days (a withdrawn or compromised account stayed signed in for a month). | 24 hours. |
| 10 | MEDIUM | `/api/live/status` (open) asked every outside source on every call, some on the metered RailRadar key, and printed raw errors; `/api/employees/analytics` was an open debug route that nothing used. | Status is for the HOD only; the debug route is deleted. |
| 11 | LOW | The holidays route returned the raw database error text to the browser. | A plain sentence; the text stays in the server log. |

## Looked at and found sound (no change)
- The question-to-SQL path: a PostgreSQL parser walks the statement, only four views and a short list of functions are allowed, the transaction is read-only, the role can only SELECT, with a time limit and a row limit; the lab route is off unless switched on and needs a login.
- Uploads: size limits, type judged by the file's first bytes, files streamed or size-checked before being read.
- Announcement HTML: a strict allow-list (no addresses, no images, only five colours); the history documents are served only from a fixed list of names; the live routes' parameters are checked against fixed shapes and their outside addresses are fixed.
- All SQL uses placeholders; the model keys and the RailRadar key are server-side only; no real secret is in any tracked file.
- Cross-site requests: the session cookie is SameSite=Lax and the management routes also check the origin.

## Added after the assessment (STATUS 274-276)
- **The whole password module is switched OFF for now by one constant (`PASSWORD_MODULE_ENABLED` in `src/lib/security/passwordModule.ts`, STATUS row 277); set it to true to activate it.** Until then the items below are built but inactive.
- Change password for every user (the HOD's kept as it is in the development phase); valid 180 days, the window comes up by itself when it has run out; the last 5 cannot be reused; no copy-paste in the three boxes.
- The OTP password change is BUILT and SWITCHED OFF (PASSWORD_OTP): it needs an SMS or e-mail gateway, which is not set up (src/lib/security/otpSender.ts).

## NOT fixed: decisions and larger jobs for the owner
1. **Passwords that are still the P.No.** (the root of #1-#3). A "Change password" window now exists (account menu, STATUS row 274), but a person who has not used it still has the P.No. as the password, which many people know (pay slips, ID cards; the Employee manager shows it to its holders). The HOD's password is deliberately kept as it is in the development phase (the HOD and the developer know it); set it from outside the app with `scripts/set-user-password.ts`, so it is no longer the P.No. that was in the code and the manual.
2. **Next.js 14 -> 15.5.x or 16** (npm audit still lists `next`, critical, and `postcss` inside it). Most of those advisories concern the image optimiser's remote sources, rewrites, server actions, custom servers and Windows hosts, none of which this app uses (no remote images, no rewrites, no server actions, Vercel runs it); the two that apply to every app (server-component denial of service) are fixed in 14.2.35. A major upgrade touches React 19 and the async `params` of every route: a separate, staged job with the full test sweep and a browser pass.
3. **A Content-Security-Policy.** Needs a pass in a real browser over every page (the PDF viewers, the history card's pdf.js worker, the lightbox, the login window) before it is switched on, because a policy that is too tight breaks a page silently.
4. **A shared rate limit.** The limits above live in one server copy's memory: they stop one machine at full speed and casual guessing, but a determined caller spread over several copies gets several times the limit. A limit all copies share needs the database (a small table: one SQL file for you to run).
5. **The open directory: DECIDED (option C), FIXED (STATUS 276).** A person who has not signed in sees an employee as a name and a department only; a lookup by mobile or P.No. needs a sign-in. The home page's People & Events widget is a separate public feature and still shows designation.
6. **Is the GitHub repository private?** The HOD's old P.No. is in the git history (removing it from the code does not remove it from history). If the repository is public, treat that password as published.
7. **Blob files are public-by-address** (unguessable random addresses): circular pages, announcement PDFs, employee photographs (the photograph route adds its own login and fetch checks). Acceptable for now; private blobs would need a change of the file store.
