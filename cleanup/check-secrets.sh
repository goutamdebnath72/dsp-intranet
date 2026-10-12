#!/bin/bash
# Is any secret in this repository's git HISTORY, and was it pushed? Run from the project root:  bash cleanup/check-secrets.sh
# Read-only: it changes nothing.
set -u
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Not a git repository."; exit 1; }
FILES=".env .env.local .env.backup.1762491806 run-docker.sh src/lib/citusers.js"
echo "1. Files git tracks RIGHT NOW that must never be tracked:"
tracked=$(git ls-files | grep -E '(^|/)\.env($|\.)|run-docker\.sh|citusers\.js' | grep -v '^\.env\.example$')
[ -z "$tracked" ] && echo "   none" || echo "$tracked" | sed 's/^/   TRACKED: /'
echo
echo "2. Were they ever committed (anywhere in history)?"
found=0
for f in $FILES; do
  n=$(git log --all --oneline -- "$f" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" != "0" ]; then
    found=1
    first=$(git log --all --format=%h -- "$f" | tail -1)
    remotes=$(git branch -r --contains "$first" 2>/dev/null | tr -d ' ' | tr '\n' ' ')
    echo "   IN HISTORY: $f  ($n commit(s))  pushed to: ${remotes:-(no remote branch has it: not pushed)}"
  fi
done
[ $found -eq 0 ] && echo "   none of them was ever committed."
echo
echo "3. Remotes: $(git remote -v | awk '{print $1" "$2}' | sort -u | tr '\n' ';')"
echo
if [ $found -eq 1 ]; then
  echo "RESULT: a secret IS in the history. If any commit above shows a remote branch, treat it as exposed:"
  echo "  - create a NEW token in Vercel (Storage > your blob store) and replace it in Vercel and in .env.local; delete the old one"
  echo "  - the passwords in citusers.js: change them if they are real login passwords"
  echo "  - push a CLEAN history: either a fresh repository from the cleaned files, or rewrite history (tell me which and I will give the steps)"
else
  echo "RESULT: history is clean. After the cleanup it is safe to push."
fi
