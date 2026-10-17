#!/bin/bash
# Prints which of the recent fixes are present in this project. Read-only. Run from the project root:  bash cleanup/check-fixes.sh
[ -f package.json ] && [ -d src ] || { echo "Run this from the project root (the folder with package.json)."; exit 1; }
bad=0
report() { # $1 = name, $2 = result (0 = present)
  if [ "$2" -eq 0 ]; then printf "  APPLIED      %s\n" "$1"; else printf "  NOT APPLIED  %s\n" "$1"; bad=1; fi
}
echo "Fixes in this project:"
{ grep -q useCircularStatus src/components/HomepageNew.tsx && ! grep -q fetchUnread src/components/CircularsModal.tsx; } 2>/dev/null; report "new-circular marker and red circle clear on the first opening" $?
grep -q weightX src/components/NewCircularBadge.tsx 2>/dev/null; report "red circle: number centred by its visual weight" $?
grep -q stickySuccess src/app/admin/page.tsx 2>/dev/null; report "upload success messages stay until their cross is clicked" $?
{ ! grep -q MonitorSizeSync src/app/layout.tsx && ! grep -q 'data-monitor-size' src/app/globals.css; } 2>/dev/null; report "page width is 80% on every screen" $?
{ test -f src/lib/circularTitle.ts && grep -q formatCircularTitle src/components/CircularsModal.tsx; } 2>/dev/null; report "circular titles are shown in running letters" $?
grep -q getRecentCircularIds src/app/page.tsx 2>/dev/null; report "red badge shows at once for a logged-out visitor" $?
{ test -f scripts/omnibar-acceptance.mjs && test -f scripts/lib/acceptance-core.mjs && test -f eval/router-acceptance.json; } 2>/dev/null; report "omnibar acceptance harness (scripts and question set)" $?
{ grep -q "A year with no data loaded has no names of its own" src/lib/holidays/terms.ts; } 2>/dev/null; report "a year with no data is still recognised as a holiday question (answered at once, no model call)" $?
{ grep -q "Count each real day once" src/lib/employees/analytics.ts && grep -q "ONE holiday (the same rule as the Holiday List)" src/lib/holidays/analytics.ts; } 2>/dev/null; report "holiday counts and year comparisons count each real day once" $?
{ grep -q "buildHolidayCompareView" src/lib/employees/analytics.ts && grep -q "HolidayCompareCard" src/components/OmnibarModal.tsx && test -f src/components/HolidayCompareCard.tsx; } 2>/dev/null; report "year comparisons are drawn as a card, and name the year that has no data" $?
{ grep -q "Holiday reminders already exist" src/lib/employees/analytics.ts; } 2>/dev/null; report "the notification answer describes the working login reminder" $?
{ test -f src/lib/search/frontPathTrace.ts && grep -q "traceHeaders" src/app/api/ai-search/route.ts && grep -q "traceModelCall" src/lib/nl2sql/llm.ts; } 2>/dev/null; report "every search is traced (route, stages, model calls and tokens)" $?
{ test -f src/lib/search/frontGate.ts && grep -q "rescueWithModel" src/app/api/ai-search/route.ts && grep -q "skipModel" src/lib/nl2sql/omnibar.ts; } 2>/dev/null; report "the front-path gate is built (off unless FRONT_PATH_SKIP_MODEL=true)" $?
{ grep -q "getSessionTicket" src/app/api/ai-search/route.ts && ! grep -q 'searchParams.get("ticket")' src/app/api/ai-search/route.ts; } 2>/dev/null; report "synthesis is allowed only for an executive found in the login session" $?
{ test -f src/lib/search/synthesisIntent.ts && grep -q "autoEdsEnabled" src/components/OmnibarModal.tsx && ! grep -q "autoEdsEnabled()" src/app/api/ai-search/route.ts; } 2>/dev/null; report "the Enter key sends an EDS-type question from a logged-in executive to Executive Deep Synthesis (off unless NEXT_PUBLIC_FRONT_PATH_AUTO_EDS=true)" $?
{ grep -q "PARTITION BY department_id" src/lib/nl2sql/prompt.ts && grep -q "rank_order 1 = MOST senior" src/lib/nl2sql/prompt.ts; } 2>/dev/null; report "the model is told how to take the top N per department and which way grades run" $?
echo
if [ "$bad" -eq 0 ]; then echo "All present."; else echo "Something is missing: apply the patch that contains it again, then restart the app."; fi
exit $bad
