#!/bin/bash
# DSP Intranet cleanup. Run it from the project root (the folder that has package.json).
#
#   bash cleanup/clean.sh            shows what it WOULD move, changes nothing
#   bash cleanup/clean.sh --apply    does it
#
# NOTHING IS DELETED. Every removed item is MOVED into  ../dsp-intranet-removed/<date-time>/  (outside the project, same folder layout), and
# files that git tracks are also recorded as removed (git rm --cached). To bring something back, move it from that folder to where it was.

set -u
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
if [ ! -f package.json ] || [ ! -d src ]; then echo "Run this from the project root (the folder with package.json)."; exit 1; fi
DEST="../dsp-intranet-removed/$(date +%Y%m%d-%H%M%S)"
IN_GIT=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IN_GIT=1

count=0
kb=0
move_item() { # $1 = why, $2 = path
  local p="$2"
  [ -e "$p" ] || return 0
  local sz
  sz=$(du -sk "$p" 2>/dev/null | cut -f1)
  printf "  %8sK  %-58s %s\n" "$sz" "$p" "$1"
  count=$((count + 1))
  kb=$((kb + sz))
  if [ "$APPLY" -eq 1 ]; then
    if [ "$IN_GIT" -eq 1 ]; then git rm -r --cached --ignore-unmatch -q -- "$p" 2>/dev/null; fi
    mkdir -p "$DEST/$(dirname "$p")"
    mv "$p" "$DEST/$p"
  fi
}

echo
[ "$APPLY" -eq 1 ] && echo "APPLYING: moving items to $DEST" || echo "DRY RUN: nothing is changed. Add --apply to do it."
echo
echo "1. SECRETS AND PASSWORDS (must never be pushed)"
move_item "a live storage token is written in this file" run-docker.sh
move_item "plaintext passwords and names of 24 people; nothing uses it" src/lib/citusers.js

echo "2. LEFTOVERS, NOT PART OF THE APP"
move_item "an old commit-message note" msg.txt
move_item "a pasted copy of tsconfig settings" temp.json
move_item "a stray image" output-1.png
move_item "the output of a test run" circular-battery-report.txt
move_item "Docker is not used (the app runs on Vercel)" Dockerfile
move_item "Docker is not used" .dockerignore
move_item "libraries for the Docker build only" apt-get.txt
move_item "OCR language data; the app downloads its own (a copy is kept in the removed folder)" eng.traineddata
move_item "OCR language data, unused" hin.traineddata
move_item "OCR language data, unused" ben.traineddata

echo "3. SOURCE FILES THAT NOTHING USES (the build and every test pass without them)"
move_item "old search bar, replaced by the omnibar" src/components/SearchBar.tsx
move_item "used only by the old search bar" src/components/AiOverview.tsx
move_item "unused component" src/components/NewHero.tsx
move_item "unused hook" src/hooks/useTypewriter.ts
move_item "unused helper" src/lib/ai/chunkText.ts
move_item "unused helper (the upload saves embeddings itself)" src/lib/ai/saveEmbedding.ts
move_item "old static list of circulars" src/lib/circulars.js
move_item "old static department list (the app uses src/lib/employees/departments.ts)" src/lib/departments.js
move_item "unused database helper" src/lib/db/config/postgres.config.ts
move_item "unused database helper" src/lib/db/force-pg.ts
move_item "unused database helper" src/lib/db/postgres.runtime.ts
move_item "unused debug helper" src/lib/debugLog.ts
move_item "unused helper" src/lib/env.ts
move_item "the old AI draft of holiday lists (the holiday data comes from the curated JSON files)" src/lib/holidays/extraction.ts
move_item "type declaration nothing needs" pdfjs.d.ts
move_item "type declaration nothing needs" src/types/pdfjs.d.ts
move_item "type declaration nothing needs (Next.js provides it)" src/app/global.d.ts

echo "4. SCRIPTS: one-off experiments (the real tools stay: bulk-upload, wipe-circulars, import-health-checkups, reread-circulars, audit-blob, test-search, circular-battery)"
for s in probe-battery probe-confidence probe-fusion probe-fusion2 probe-holidays-battery probe-holidays probe-parser probe-robust probe-search; do
  move_item "a search-tuning experiment" "scripts/$s.mjs"
done
move_item "a one-off migration, already done" scripts/backfill-page-numbers.mjs

echo "5. PUBLIC FILES THE APP NEVER LOADS"
move_item "unused picture folder" public/incorrect
move_item "byte-for-byte copies of files already in public/" public/correct
move_item "default Next.js icon" public/vercel.svg
move_item "default Next.js icon" public/next.svg
move_item "default Next.js icon" public/globe.svg
move_item "default Next.js icon" public/window.svg
move_item "default Next.js icon" public/file.svg
move_item "unused video (the page uses Steel_Plant_Video.mp4)" public/Steel_Plant_Video1.mp4
move_item "unused picture" public/steel-plant2.png
move_item "unused picture (the app uses the -preview one)" public/coke-oven-batteries.png
move_item "unused picture (the app uses the -modified one)" public/wheel-axle-icon.png

echo "6. LARGE ORIGINALS THAT DO NOT BELONG IN GIT (the 7 curated Holidays/*.json files STAY)"
move_item "the 8 original holiday-list PDFs (24 MB)" "Holidays/holiday circulars"

echo "7. MACHINE-MADE JUNK"
while IFS= read -r f; do case "$f" in public/incorrect/*|public/correct/*) continue ;; esac; move_item "a Windows download marker" "$f"; done < <(find . \( -name "*Zone.Identifier" \) -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./.next/*" 2>/dev/null | sed 's#^\./##')
while IFS= read -r f; do move_item "macOS folder junk" "$f"; done < <(find . -name ".DS_Store" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./.next/*" 2>/dev/null | sed 's#^\./##')

echo
echo "$count items, about $((kb / 1024)) MB."
if [ "$APPLY" -eq 1 ]; then
  echo "Moved to $DEST (nothing was deleted)."
  echo "Next:  git status   |   bash cleanup/check-secrets.sh   |   npm run build"
else
  echo "Nothing was changed. If the list looks right:  bash cleanup/clean.sh --apply"
fi
