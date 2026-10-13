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
echo
if [ "$bad" -eq 0 ]; then echo "All present."; else echo "Something is missing: apply the patch that contains it again, then restart the app."; fi
exit $bad
