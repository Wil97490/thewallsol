#!/usr/bin/env bash
# Detects divergence between the sources of truth. Read-only.
#
#   deploy.env      canonical operating values
#   src/config.js   the defaults the code falls back to
#   CLAUDE.md       what we tell the next session those values are
#
# It invents nothing. Every value compared is read from a file in the repo.
# A divergence is reported, never silently corrected: only the operator
# decides which side is wrong.
set -euo pipefail
cd "$(dirname "$0")/.."

DRIFT=0
ok()   { printf '  ok   %s\n' "$1"; }
bad()  { printf '  DRIFT %s\n' "$1"; DRIFT=1; }

echo "· deploy.env vs src/config.js defaults"
while IFS='|' read -r key env_val src_val; do
  [ -z "$key" ] && continue
  if [ "$env_val" = "$src_val" ]; then ok "$(printf '%-22s %s' "$key" "$env_val")"
  else bad "$(printf '%-22s deploy.env=%s  config.js default=%s' "$key" "$env_val" "$src_val")"; fi
done < <(python3 - <<'PY'
import re
env = dict(re.findall(r'^export ([A-Z_]+)=(\S+)', open("deploy.env").read(), re.M))
src = dict(re.findall(r'num\(process\.env\.([A-Z_]+),\s*([0-9.]+)\)', open("src/config.js").read()))
for k in ["SEAT_COUNT","SEAT_FLOOR_USD","MIN_INCREMENT_PCT","MIN_INCREMENT_USD",
          "MAX_BID_USD","SEAT_HOLD_MINUTES","SEAT_PROTECT_MINUTES","SCOUT_ROUND_LIMIT"]:
    e, s = env.get(k), src.get(k)
    if e is None or s is None:
        print("%s|%s|%s" % (k, e or "(absent)", s or "(absent)")); continue
    same = abs(float(e) - float(s)) < 1e-12
    print("%s|%s|%s" % (k, e, e if same else s))
PY
)

echo "· deploy.env vs the invariant table in CLAUDE.md"
python3 - <<'PY'
import re, sys
env = dict(re.findall(r'^export ([A-Z_]+)=(\S+)', open("deploy.env").read(), re.M))
doc = open("CLAUDE.md").read()
# each: label in CLAUDE.md, the env key, how the value is written in prose
checks = [("Seats on the wall",  "SEAT_COUNT",          lambda v: v),
          ("Seat floor",         "SEAT_FLOOR_USD",      lambda v: "$" + v),
          ("Bid ceiling",        "MAX_BID_USD",         lambda v: "$" + format(int(v), ",")),
          ("Hold on a reserved seat", "SEAT_HOLD_MINUTES", lambda v: v + " minutes"),
          ("Protection after purchase","SEAT_PROTECT_MINUTES", lambda v: v + " minutes")]
bad = 0
for label, key, fmt in checks:
    want = fmt(env[key])
    row = re.search(r'^\|\s*' + re.escape(label) + r'\s*\|\s*(.+?)\s*\|', doc, re.M)
    if not row:
        print("  DRIFT %-34s absent from the CLAUDE.md table" % label); bad = 1
    elif row.group(1) != want:
        print("  DRIFT %-34s CLAUDE.md says %r, deploy.env says %r" % (label, row.group(1), want)); bad = 1
    else:
        print("  ok   %-34s %s" % (label, want))
sys.exit(2 if bad else 0)
PY
[ $? -eq 2 ] && DRIFT=1 || true

echo "· dead configuration"
for v in TAKEOVER_MULTIPLIER; do
  in_src=$({ grep -rlE "$v" src/ 2>/dev/null || true; } | wc -l | tr -d ' ')
  in_other=$({ grep -rlE "$v" test/ deploy.env 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$in_src" -gt 0 ]; then ok "$(printf '%-22s read by src/' "$v")"
  elif [ "$in_other" -gt 0 ]; then bad "$(printf '%-22s set outside src/ but read nowhere in src/' "$v")"
  else ok "$(printf '%-22s absent everywhere' "$v")"; fi
done

echo "· PROPOSED models must not be implemented"
# The Master Context marks these 🟡. Code implementing them would mean an
# unvalidated economic model shipped. Absence here is the correct state.
for pat in "flywheel" "rewards vault" "protocol reserve" "community point" "wall point"; do
  n=$({ grep -rli "$pat" src/ 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$n" -eq 0 ]; then ok "$(printf '%-22s not implemented (correct)' "$pat")"
  else bad "$(printf '%-22s appears in %s src file(s) — 🟡 PROPOSED, needs a SPEC' "$pat" "$n")"; fi
done

echo "· continuity"
for f in docs/THE_WALL_MASTER_CONTEXT_V2.md docs/THE_WALL_CLAUDE_CODE_HANDOFF_V1.md docs/STATE.md docs/DECISIONS.md CLAUDE.md; do
  [ -f "$f" ] && ok "$f" || bad "$f missing"
done

echo
if [ "$DRIFT" -eq 0 ]; then echo "no drift."; else echo "DRIFT FOUND — report it, do not silently correct it."; fi
exit "$DRIFT"
