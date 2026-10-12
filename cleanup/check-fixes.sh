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
echo
if [ "$bad" -eq 0 ]; then echo "All present."; else echo "Something is missing: unzip the latest patch again (unzip -q -o ~/Downloads/patch_step10b.zip) and restart the app."; fi
exit $bad
