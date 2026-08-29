#!/usr/bin/env bash
# Runs the release checklist against a DEPLOYED wall, not a local one.
# The test suite proves the logic; this proves the thing you deployed.
#
#   ./scripts/preflight.sh https://wall-xxx.run.app "$GATE_TOKEN"
set -euo pipefail

URL="${1:?usage: preflight.sh <url> <gate-token> [admin-token]}"
TOKEN="${2:?missing GATE_TOKEN}"
ADMIN="${3:-}"
FAIL=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; FAIL=1; }

facts() { # $1 = json overrides
  jq -c ". * $1" <<'BASE'
{"mintAuthority":false,"freezeAuthority":false,"lpLocked":true,"lpUsd":40000,
 "topHolderPct":9,"holdersSampled":20,"ageHours":72,"tickerTaken":false,
 "linkStatus":200,"linkThreat":"none","gatherError":null}
BASE
}

probe() { # name expected overrides
  local name="$1" expected="$2" payload
  payload=$(jq -nc --argjson f "$(facts "$3")" \
    '{fields:{ticker:"PREFLIGHT",pitch:"preflight probe",link:"https://example.com",mint:"So11111111111111111111111111111111111111112"},facts:$f}')
  local code
  code=$(curl -s -o /tmp/pf.json -w '%{http_code}' "$URL/gate" \
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$payload")
  if [ "$code" = "$expected" ]; then pass "$(printf '%-32s %s' "$name" "$code")"
  else fail "$(printf '%-32s got %s want %s' "$name" "$code" "$expected")"; cat /tmp/pf.json; echo; fi
}

echo "preflight against $URL"

echo "· service"
curl -sf "$URL/health" | jq -e '.ok == true' >/dev/null && pass "health responds" || { fail "health"; exit 1; }
curl -sf "$URL/health" | jq -e '.agentsEnabled == true' >/dev/null && pass "agents enabled" || fail "agents are OFF — no seat can be sold"

echo "· auth"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/gate" -d '{}')
[ "$code" = "401" ] && pass "unauthenticated gate rejected" || fail "gate answered $code without a token"
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/admin/ops")
[ "$code" = "401" ] && pass "unauthenticated back office rejected" || fail "back office answered $code without a token"

echo "· hard rules (each must refuse: 409)"
probe "open mint authority"    409 '{"mintAuthority":true}'
probe "open freeze authority"  409 '{"freezeAuthority":true}'
probe "unlocked liquidity"     409 '{"lpLocked":false}'
probe "dust pool"              409 '{"lpUsd":100}'
probe "whale holder"           409 '{"topHolderPct":55}'
probe "dead link"              409 '{"linkStatus":404}'
probe "broken destination"     409 '{"linkStatus":503}'
probe "bot-filtered sells"     200 '{"linkStatus":403}'
probe "flagged link"           409 '{"linkThreat":"malware"}'
probe "unchecked link"         409 '{"linkThreat":"unchecked"}'
probe "facts gather failure"   409 '{"gatherError":"rpc timeout"}'
probe "unproven lock, no reason" 409 '{"lpLocked":false,"lpProof":null}'
probe "unmodelled DEX sells"   200 '{"lpLocked":false,"lpProof":"dex_unmodelled","dexId":"meteora"}'
probe "measured unlocked LP"   409 '{"lpLocked":false,"lpProof":"not_burned"}'
probe "pool unreadable"        409 '{"lpProof":"unavailable"}'
probe "mint too large to sample" 200 '{"holdersProof":"too_many_accounts","holdersSampled":0,"topHolderPct":null}'
probe "no pool at all"         409 '{"lpLocked":false,"lpUsd":0,"lpProof":"no_pool"}'
probe "clean token sells"      200 '{}'

# ---------------------------------------------------------------------
# The $PISTACIO regression, checked against the DEPLOYED rules.
#
# An HTTP code cannot tell these apart: a refusal and a held check both
# answer 409. That is exactly how this shipped — the code was right and
# the sentence underneath it was a finding about a token that said "No
# destination link was supplied" when nobody had supplied anything.
# So this probe reads the body.
# ---------------------------------------------------------------------
# ---------------------------------------------------------------------
# Les pages publiques répondent-elles VRAIMENT ?
#
# /seen est parti en production avec un import manquant : 503 à chaque
# visite, et la suite de tests au vert — elle appelait la fonction de
# rendu, jamais la route. Le preflight teste la révision réelle.
# ---------------------------------------------------------------------
echo "· les pages publiques répondent sur la révision candidate"
for pair in "/:seats" "/rules:Hard rules" "/refused:refused" "/seen:What the wall" \
            "/checks:how to run them" \
            "/checks/mint-authority:mintAuthority" \
            "/checks/freeze-authority:freezeAuthority" \
            "/checks/liquidity-lock:1nc1nerator" \
            "/checks/holder-concentration:getTokenLargestAccounts" \
            "/checks/pool-depth:dexscreener" \
            "/checks/pair-age:pairCreatedAt" \
            "/checks/destination-link:curl -sI" \
            "/terms:Terms" "/sitemap.xml:<urlset"; do
  path="${pair%%:*}"; needle="${pair#*:}"
  code=$(curl -s -o /tmp/pf-page -w '%{http_code}' "$URL$path")
  if [ "$code" != "200" ]; then
    fail "$(printf '%-14s %s' "$path" "a répondu $code")"
  elif grep -qi "Checks unavailable" /tmp/pf-page; then
    fail "$(printf '%-14s %s' "$path" "200 mais la route a planté")"
  elif ! grep -qi -- "$needle" /tmp/pf-page; then
    fail "$(printf '%-14s %s' "$path" "200 mais sans son contenu")"
  else
    pass "$(printf '%-14s %s' "$path" "200")"
  fi
done

echo "· a missing link is our gap, not their finding"
payload=$(jq -nc --argjson f "$(facts '{"linkThreat":"missing","linkStatus":0}')" \
  '{fields:{ticker:"PREFLIGHT",pitch:"preflight probe",link:null,mint:"So11111111111111111111111111111111111111112"},facts:$f}')
curl -s -o /tmp/pf-link.json "$URL/gate" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$payload"

if jq -e '.retryable == true' /tmp/pf-link.json >/dev/null 2>&1; then
  pass "missing link is held, not refused"
else
  fail "missing link produced a REFUSAL — this is the PISTACIO bug"; cat /tmp/pf-link.json; echo
fi
if jq -e '[.ruleIds[]?] | index("link_absent")' /tmp/pf-link.json >/dev/null 2>&1; then
  pass "reported as link_absent"
else
  fail "link_absent is not the rule that fired"; cat /tmp/pf-link.json; echo
fi
if jq -e '[.detail[]?] | join(" ") | test("supplied|malicious") | not' /tmp/pf-link.json >/dev/null 2>&1; then
  pass "says nothing about what they supplied"
else
  fail "the published sentence still blames the project"; cat /tmp/pf-link.json; echo
fi

echo "· the selling path does not take facts from the caller"
# The public endpoint must ignore any facts in the body and go read the
# chain itself. A clean-looking payload for a mint that is not a real
# token must NOT come back allow:true.
code=$(curl -s -o /tmp/pf2.json -w '%{http_code}' "$URL/api/checkout" \
  -H 'content-type: application/json' \
  -d '{"seatNo":1,"ticker":"PFTEST","mint":"So11111111111111111111111111111111111111112","link":"https://example.com","pitch":"preflight","facts":'"$(facts '{}')"'}')
if [ "$code" = "200" ] && jq -e '.allow == true' /tmp/pf2.json >/dev/null 2>&1; then
  fail "checkout accepted injected facts — the gate is grading the buyer's homework"
else
  pass "injected facts ignored on the selling path ($code)"
fi

echo "· link checker is not an open proxy"
probe "link to the metadata endpoint" 409 '{"linkThreat":"private_address","linkStatus":0}'

echo "· the published pages"
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/refused/definitely-not-a-real-slug-here")
[ "$code" = "404" ] && pass "an address we never published is a 404" || fail "unpublished slug answered $code"
# Never `curl ... | grep -q`: grep exits on the first match, curl takes a
# SIGPIPE mid-write, and pipefail reports a healthy page as a failure.
# It cost one confusing red line already. Download, then read the file.
has() { # url pattern label
  curl -sf "$1" -o /tmp/pf_page.html 2>/dev/null && grep -q "$2" /tmp/pf_page.html \
    && pass "$3" || fail "$3"
}
has "$URL/sitemap.xml" "<urlset" "the sitemap is generated"
# Google revoque la propriete si ce fichier disparait, et ne previent
# personne : le site sort simplement de la Search Console.
has "$URL/googlebcc882ef153fa8c5.html" "google-site-verification" "the Search Console verification file is served"
# The film is served immutable for a year. A 404 here means the page shows
# a broken frame to every visitor until someone notices by eye.
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL$(curl -sf "$URL/" | grep -o '/how-it-works-[0-9]*\.mp4' | head -1)")
[ "$code" = "200" ] && pass "the film the home page asks for exists" || fail "the film is $code — the home page points at nothing"

# `script-src 'self'` refuse tout script en ligne, en silence : le
# serveur répond 200 et la fonctionnalite est simplement absente. Deux
# pages ont ete livrees comme ca le meme jour.
for path in "/" "/terms" "/rules" "/refused" "/checks" "/checks/pool-depth"; do
  curl -sf "$URL$path" -o /tmp/pf_csp.html 2>/dev/null || continue
  if grep -oE '<script(([^>]*)(src=)([^>]*))?>' /tmp/pf_csp.html \
     | grep -v 'src=' | grep -v 'application/ld+json' | grep -q '<script'; then
    fail "$path serves an inline script — the CSP will refuse it silently"
  else
    pass "$(printf '%-24s no inline script' "$path")"
  fi
done
has "$URL/terms" "Refunds" "terms and refunds are published"
# Deux canaux de contact, pas un. Un droit de réponse qui dépend d'un
# seul chemin est un droit de réponse qui tombe avec ce chemin.
for path in "/" "/terms" "/rules" "/refused"; do
  has "$URL$path" "t.me/ThewallSol" "$(printf '%-24s mène au Telegram' "$path")"
done

# Un champ à trous affiché sur une page publique. /terms a servi
# « [to be completed] » pendant des jours sous « Who publishes this
# site ». Les commentaires HTML sont retirés : la note qui explique
# leur retrait cite le marqueur, et personne ne la lit.
for path in "/" "/terms" "/rules" "/refused"; do
  # `sed 's/<!--.*-->//g'` travaille LIGNE PAR LIGNE. Le commentaire qui
  # explique le retrait des champs à trous dans terms.html tient sur
  # dix-sept lignes : sed n'en retirait rien, et la ligne qui cite
  # « [to be completed] » déclenchait l'alarme. Le test Node, lui,
  # utilisait une regex multiligne et passait — les deux contrôles
  # disaient donc le contraire l'un de l'autre.
  #
  # Une fausse alerte dans une barrière de publication est un bug à part
  # entière : elle bloque une version saine, et le réflexe suivant est de
  # désactiver le contrôle. Python fait ici exactement ce que fait le
  # test, pour qu'ils ne puissent plus diverger.
  if curl -sf "$URL$path" 2>/dev/null \
     | python3 -c "import sys,re;print(re.sub(r'<!--.*?-->','',sys.stdin.read(),flags=re.S))" \
     | grep -qi "to be completed"; then
    fail "$path affiche un champ à trous"
  else
    pass "$(printf '%-24s aucun champ à trous' "$path")"
  fi
done
# La page a affirme le contraire pendant une journee. Un site qui
# controle des contrats ne peut pas se permettre cette ligne-la fausse.
has "$URL/rules" "There is a token. We launched it." "the token disclosure is live"

# Le maillage : une page de refus dont les constats ne renvoient nulle
# part est une page de reference sans reference. C'est tout l'interet de
# /checks, et c'est silencieux quand ca casse.
if curl -sf "$URL/api/refused" -o /tmp/pf_led.json 2>/dev/null; then
  slug=$(grep -o '"slug":"[^"]*"' /tmp/pf_led.json | head -1 | cut -d'"' -f4)
  if [ -n "$slug" ]; then
    if curl -sf "$URL/refused/$slug" -o /tmp/pf_ref.html 2>/dev/null \
       && grep -q 'href="/checks/' /tmp/pf_ref.html; then
      pass "$(printf '%-24s renvoie vers ses controles' "/refused/$slug")"
    else
      fail "/refused/$slug ne renvoie vers aucune page de controle"
    fi
  fi
fi
if curl -sf "$URL/rules" -o /tmp/pf_tok.html 2>/dev/null && grep -q "The Wall has no token" /tmp/pf_tok.html; then
  fail "the site still claims it has no token"
else
  pass "the old no-token claim is gone"
fi

echo "· the daily round"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/admin/scout" -H 'content-type: application/json' -d '{}')
[ "$code" = "401" ] && pass "the round is closed without a token" || fail "the round answered $code without a token"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/cron/scout" -H 'content-type: application/json' -d '{}')
[ "$code" = "401" ] && pass "the scheduled round is closed without a token" || fail "cron/scout answered $code without a token"

if [ -n "$ADMIN" ]; then
  # The property the whole design rests on: looking is not publishing.
  # A round that quietly fed the public ledger would turn the wall from
  # a registrar into a machine that names a dozen projects a day.
  before=$(curl -s "$URL/api/refused" | jq '(.rows // []) | length')
  curl -s -o /tmp/pf3.json -X POST "$URL/api/admin/scout" \
    -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' -d '{"limit":1}' || true
  after=$(curl -s "$URL/api/refused" | jq '(.rows // []) | length')
  if [ "$before" = "$after" ]; then pass "a round records nothing ($before rows before and after)"
  else fail "a round wrote to the public ledger: $before -> $after"; fi

  if jq -e '[.sources[] | select(.ok)] | length > 0' /tmp/pf3.json >/dev/null 2>&1; then
    pass "candidate discovery is reachable"
  else
    # Not a release blocker: the wall sells seats without it. But you
    # want to know today, not the morning the post does not happen.
    printf '  warn %s\n' "candidate discovery found no live source — the daily round will be empty"
  fi
fi

echo
if [ "$FAIL" = "0" ]; then
  cat <<'DONE'
PASS — the deployed wall refuses everything it must refuse.

Still yours to verify by hand, because no script can:
  · a human is actually watching /admin and clearing the review queue
  · audit rows survive a scale-to-zero (STORAGE_BACKEND=firestore)
  · the Anthropic spend limit is set on the account
  · TREASURY_WALLET is a wallet you control, and you have tested a
    real transfer of the smallest seat price end to end
DONE
else
  echo "FAIL — do not open the wall."
  exit 1
fi
