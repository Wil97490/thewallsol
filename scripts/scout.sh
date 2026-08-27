#!/usr/bin/env bash
# ------------------------------------------------------------------
# The daily round. One command in the morning, one post out.
#
#   ./scripts/scout.sh [n]                   propose  (records nothing)
#   ./scripts/scout.sh commit <MINT> <TICK>  publish  (feeds the ledger)
#   ./scripts/scout.sh contacted <MINT>      strike a lead off the list
#
# Reads WALL_URL and ADMIN_TOKEN from the environment, or from
# deploy.env / .scout.env if they are sitting there.
#
# The two halves are deliberately separate. The first looks at a dozen
# contracts and asserts nothing about any of them. The second re-runs
# the identical checks on the ONE you chose, at the moment you publish
# it, and records that. So the numbers in the post are the numbers that
# were true when it went out — not ones measured an hour earlier and
# reheated.
# ------------------------------------------------------------------
set -euo pipefail

[ -f deploy.env ] && . ./deploy.env
[ -f .scout.env ] && . ./.scout.env

URL="${WALL_URL:-${PUBLIC_BASE_URL:-}}"
TOKEN="${ADMIN_TOKEN:-}"
: "${URL:?set WALL_URL, or PUBLIC_BASE_URL in deploy.env}"
: "${TOKEN:?set ADMIN_TOKEN}"
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

RULE="  ------------------------------------------------------------"
DASH="  ............................................................"

api() { # method path [body]
  curl -sS -X "$1" "$URL$2" \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' \
    ${3:+-d "$3"}
}

die_on_error() { # json
  if printf '%s' "$1" | jq -e 'type == "object" and has("error")' >/dev/null 2>&1; then
    printf '%s\n' "$1" | jq .
    exit 1
  fi
}

# ---- commit: the one you picked, measured now, and recorded ---------
if [ "${1:-}" = "commit" ]; then
  MINT="${2:?usage: scout.sh commit <mint> <ticker> [link]}"
  TICKER="${3:?usage: scout.sh commit <mint> <ticker> [link]}"
  LINK="${4:-}"

  OUT=$(api POST /api/admin/screen \
    "$(jq -nc --arg m "$MINT" --arg t "$TICKER" --arg l "$LINK" \
       '{mint:$m, ticker:$t, link:(if $l=="" then null else $l end), dry:false}')")
  die_on_error "$OUT"

  VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict // (if .allow then "flagged" else "refused" end)')

  printf '%s\n' "$RULE"
  printf '  $%s  %s\n' "$(printf '%s' "$TICKER" | tr '[:lower:]' '[:upper:]')" "$VERDICT"
  printf '%s\n' "$RULE"
  printf '%s' "$OUT" | jq -r '.reasons[]? | "  . " + .'
  printf '%s\n' "$RULE"

  if [ "$VERDICT" = "clear" ]; then
    cat <<'NOTE'

  Nothing to post.

  A contract nobody submitted that passes every check is not a finding,
  it is an endorsement -- and this account does not vouch for tokens.
  It was checked, it was not published. Run the round again.
NOTE
    exit 0
  fi

  # The draft comes from the server, not from here. A CLI that rebuilds
  # the post itself drifts from the back office within a week.
  #
  # And the server now decides whether there IS a draft. It used to hand
  # one back for any outcome at all, which is how a refusal whose only
  # finding was our own missing link came back as a finished post about
  # a token with $11M of daily volume.
  POST=$(printf '%s' "$OUT" | jq -r '.post // false')
  if [ "$POST" != "true" ]; then
    printf '\n  Nothing to post.\n\n'
    printf '%s' "$OUT" | jq -r '"  " + (.withheld // "this outcome is not publishable")'
    printf '\n  Nothing was recorded either — the ledger only carries what we publish.\n'
    exit 0
  fi

  printf '\n  post this:\n%s\n' "$DASH"
  printf '%s' "$OUT" | jq -r '.draft'
  printf '%s\n' "$DASH"
  [ "$(printf '%s' "$OUT" | jq -r '.recorded // false')" = "true" ] \
    && printf '  the ledger now carries it:  %s/refused\n' "$URL"
  exit 0
fi

# ---- contacted: strike one off the standing list --------------------
if [ "${1:-}" = "contacted" ]; then
  MINT="${2:?usage: scout.sh contacted <mint>}"
  OUT=$(api POST "/api/admin/contacted/$MINT" '{}')
  die_on_error "$OUT"
  printf '  struck off. %s left on the list.\n' "$(printf '%s' "$OUT" | jq -r '.remaining // "?"')"
  exit 0
fi

# ---- the round ------------------------------------------------------
LIMIT="${1:-24}"
RES=$(api POST /api/admin/scout "$(jq -nc --argjson n "$LIMIT" '{limit:$n}')")
die_on_error "$RES"

printf '%s\n' "$RULE"
printf '%s' "$RES" | jq -r '
  "  sources     " + ([.sources[] | if .ok then "\(.id):\(.found)" else "\(.id):DEAD" end] | join("   ")),
  "  candidates  \(.seen) seen . \(.alreadyKnown) already checked . \(.priced) priced . \(.shortlist | length) shortlisted",
  "  discarded   \(.droppedCount // 0) — " + ((.droppedWhy // {}) | to_entries | sort_by(-.value) | map("\(.value) \(.key)") | join(", "))'
printf '%s\n' "$RULE"

printf '%s' "$RES" | jq -r '
  def pad(w): .[0:w] + (" " * (w - ([w, length] | min)));
  def m(n): (n // 0) as $n
    | if $n >= 1000000 then "\(($n/1000000)|floor)M"
      elif $n >= 1000 then "\(($n/1000)|floor)k"
      else "\($n)" end;
  .checked[]
  | "  " + (if .post then "POST  " else "   .  " end)
    + ("$" + (.ticker // "?") | pad(13))
    + ((.verdict // "?") | ascii_upcase | pad(11))
    + ("vol " + m(.vol24Usd) | pad(11))
    + ("lp " + m(.lpUsd) | pad(10))
    + ((.via // []) | join(",") | pad(22))
    + (if .post then "" else (.why // "") end)'
printf '%s\n' "$RULE"

# A dead source list and a quiet market look identical from here, and
# they are not the same thing at all. Say which one happened -- the
# whole site is built on not reporting our own outage as a finding.
ALIVE=$(printf '%s' "$RES" | jq '[.sources[] | select(.ok)] | length')
if [ "$ALIVE" = "0" ]; then
  cat <<'NOTE'

  DISCOVERY IS DOWN -- every candidate source failed.

  This is not "nothing to post today": we looked at nothing. The reasons
  are in the sources line above. Nothing was checked and nothing was
  recorded. Try again, and if it persists the endpoints have moved.
NOTE
  exit 2
fi

POSTABLE=$(printf '%s' "$RES" | jq '[.checked[] | select(.post)] | length')
if [ "$POSTABLE" = "0" ]; then
  cat <<'NOTE'

  Nothing publishable in this round.

  That is a normal outcome, not a failure: most contracts either pass,
  or fail on something that is a limit of our checks rather than a
  finding about them. Run it again later, or with a larger number.
NOTE
  exit 0
fi

printf '%s' "$RES" | jq -r --arg dash "$DASH" '
  .checked[] | select(.post) |
  "\n  $\(.ticker)   score \(.score)\n  \(.mint)\n"
  + $dash + "\n" + .draft + "\n" + $dash + "\n"
  + "  commit:  ./scripts/scout.sh commit \(.mint) \(.ticker)"
  + (if .link then " \(.link)" else "" end)'

printf '\n%s\n' "$RULE"
printf '  nothing above was recorded. commit the one you want.\n'

# ---- and the ones you can sell to -----------------------------------
# A list that could not be saved must say so here. It used to be
# swallowed, and the round went on printing leads it had already lost.
if [ "$(printf '%s' "$RES" | jq -r '.prospectsStored // true')" = "false" ]; then
  printf '\n  WARNING — the prospect list could NOT be saved.\n'
  printf '  What is printed below is this round only. It will be gone tomorrow.\n'
fi

LEADS=$(printf '%s' "$RES" | jq '(.prospects // []) | length')
FRESH=$(printf '%s' "$RES" | jq '.freshProspects // 0')
if [ "$LEADS" != "0" ]; then
  printf '\n%s\n  who to write to  (%s on the list, %s new tonight)\n%s\n' "$RULE" "$LEADS" "$FRESH" "$RULE"
  printf '%s' "$RES" | jq -r '
    def pad(w): .[0:w] + (" " * (w - ([w, length] | min)));
    def m(n): (n // 0) as $n
      | if $n >= 1000000 then "\(($n/1000000)|floor)M"
        elif $n >= 1000 then "\(($n/1000)|floor)k"
        else "\($n)" end;
    .prospects[]
    | "  " + ("$" + (.ticker // "?") | pad(13))
      + ((.verdict // "?") | ascii_upcase | pad(9))
      + ("vol " + m(.vol24Usd) | pad(11))
      + ((.links.twitter // .links.telegram // .links.website // "-") | pad(46))'
    printf '%s\n' "$RULE"
  printf '  the same list, with the messages, is on /admin — nothing here sends anything.\n'
  printf '  written to one?   ./scripts/scout.sh contacted <MINT>\n'
fi
