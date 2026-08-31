#!/usr/bin/env bash
# Read-only snapshot of the repository. Writes nothing, runs no test, and
# never touches the network. Two audits are meant to be diffed:
#
#   ./scripts/audit.sh > /tmp/a.txt   # ... work ...   diff /tmp/a.txt <(./scripts/audit.sh)
#
# Nothing here is a judgement. It reports what is, and marks what is missing.
set -euo pipefail
cd "$(dirname "$0")/.."

ok()   { printf '  ok   %s\n' "$1"; }
miss() { printf '  --   %s\n' "$1"; }
val()  { printf '  %-34s %s\n' "$1" "$2"; }

echo "· git"
val "branch"        "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(not a repo)')"
val "commit"        "$(git rev-parse --short HEAD 2>/dev/null || echo '-')"
val "tracked files" "$(git ls-files | wc -l | tr -d ' ')"
if [ -z "$(git status --porcelain)" ]; then ok "working tree clean"
else printf '  --   working tree dirty:\n'; git status --porcelain | sed 's/^/         /'; fi
val "upstream"      "$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo '(none)')"

echo "· structure"
for d in src src/agents src/lib public scripts test docs docs/specs docs/reports .claude .claude/commands; do
  [ -d "$d" ] && ok "$(printf '%-22s %s files' "$d/" "$(find "$d" -maxdepth 1 -type f | wc -l | tr -d ' ')")" || miss "$d/"
done

echo "· continuity documents"
for f in docs/THE_WALL_MASTER_CONTEXT_V2.md docs/THE_WALL_CLAUDE_CODE_HANDOFF_V1.md docs/STATE.md docs/DECISIONS.md; do
  [ -f "$f" ] && ok "$(printf '%-46s %s lines' "$f" "$(wc -l < "$f" | tr -d ' ')")" || miss "$f"
done

echo "· workflow files"
for f in CLAUDE.md .claude/settings.json .claude/commands/audit.md .claude/commands/spec.md \
         docs/specs/SPEC-TEMPLATE.md docs/reports/REPORT-TEMPLATE.md \
         scripts/audit.sh scripts/drift.sh scripts/report.sh test/invariants.test.js; do
  [ -f "$f" ] && ok "$f" || miss "$f"
done

echo "· tests available"
val "test files"    "$(find test -name '*.test.js' | wc -l | tr -d ' ')"
val "test() declared (static)" "$(grep -rhoE '^\s*(test|it)\(' test/*.test.js | wc -l | tr -d ' ')"
for f in $(find test -name '*.test.js' | sort); do
  printf '  %-34s %s\n' "$(basename "$f")" "$(grep -cE '^\s*(test|it)\(' "$f" | tr -d ' ')"
done

echo "· npm scripts"
python3 - <<'PY'
import json
for k, v in sorted(json.load(open("package.json")).get("scripts", {}).items()):
    print("  %-34s %s" % (k, v))
PY

echo "· canonical configuration (deploy.env)"
if [ -f deploy.env ]; then
  grep -E '^export [A-Z_]+=' deploy.env | sed 's/^export //' | sort | sed 's/^/  /'
else miss "deploy.env"; fi

echo "· secrets hygiene"
for f in .scout.env .env .env.local; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then printf '  FAIL %s is TRACKED\n' "$f"
  else ok "$(printf '%-22s untracked' "$f")"; fi
done
for p in node_modules/ data/ .scout.env .env; do
  grep -qxF "$p" .gitignore 2>/dev/null && ok "$(printf '%-22s gitignored' "$p")" || miss "$p not in .gitignore"
done

echo "· drift signals"
if grep -rqE 'TAKEOVER_MULTIPLIER' src/ 2>/dev/null; then ok "TAKEOVER_MULTIPLIER has a consumer in src/"
else
  if grep -rqE 'TAKEOVER_MULTIPLIER' test/ 2>/dev/null; then
    printf '  --   TAKEOVER_MULTIPLIER set in test/ but read nowhere in src/\n'
  fi
fi
n=$(grep -rlE 'TODO|FIXME|XXX' src/ test/ scripts/ 2>/dev/null | wc -l | tr -d ' ')
val "files with TODO/FIXME/XXX" "$n"
