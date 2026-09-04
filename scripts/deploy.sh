#!/usr/bin/env bash
# Deploy is gated on the tests. There is no --force.
set -euo pipefail

# Réglages non secrets, versionnés avec le dépôt.
[ -f deploy.env ] && . ./deploy.env

: "${PROJECT:?PROJECT manquant — remplissez deploy.env}"
: "${TREASURY_WALLET:?TREASURY_WALLET manquant — remplissez deploy.env}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-wall}"
SA="${SERVICE_ACCOUNT:-wall-agents}@$PROJECT.iam.gserviceaccount.com"

# Le premier déploiement n'a pas encore d'URL : Cloud Run ne la donne
# qu'une fois le service créé. On déploie avec un marqueur, puis on
# repasse la vraie URL juste après. Les fois suivantes, deploy.env la
# contient déjà et rien de tout ça ne se produit.
FIRST_RUN=0
if [ -z "${PUBLIC_BASE_URL:-}" ]; then
  FIRST_RUN=1
  PUBLIC_BASE_URL="https://pending.invalid"
  echo "→ premier déploiement : l'URL publique sera renseignée après création du service"
fi

echo "→ release gate"
npm test

# --set-env-vars REMPLACE toute la liste : un réglage absent d'ici
# repasse à sa valeur par défaut au prochain déploiement. Les tunables
# vivent donc dans deploy.env, pas dans un "gcloud run services update".
# La révision est déployée SANS TRAFIC et sous une étiquette. Le
# preflight interroge cette révision-là ; le trafic ne bascule qu'après.
# Sinon le contrôle de sécurité s'exécute sur une version déjà en ligne
# et ne peut plus que constater les dégâts.

# Le secret Resend peut ne pas exister encore. L'ajouter à --set-secrets
# sans vérifier ferait échouer TOUT le déploiement pour un e-mail : le
# service ne démarre pas si un secret référencé est introuvable. Donc on
# regarde d'abord, et on se passe des reçus plutôt que du site.
SECRETS="ANTHROPIC_API_KEY=anthropic-api-key:latest,GATE_TOKEN=gate-token:latest,ADMIN_TOKEN=admin-token:latest,SOLANA_RPC_URL=solana-rpc-url:latest,SAFE_BROWSING_KEY=safe-browsing-key:latest"
if gcloud secrets describe resend-api-key --project "$PROJECT" >/dev/null 2>&1; then
  SECRETS="$SECRETS,RESEND_API_KEY=resend-api-key:latest"
else
  echo "→ pas de secret resend-api-key : les acheteurs ne recevront pas de reçu (DEPLOY.md §2.6)"
fi

# Délimiteur « | » et pas la virgule. Une adresse postale en contient
# une ("12 rue X, 97420 Le Port") et gcloud découperait la liste au
# milieu de l'adresse — la variable suivante deviendrait "97420 Le Port".
# La syntaxe ^|^ dit à gcloud quel séparateur lire.
ENVVARS="STORAGE_BACKEND=firestore|AGENTS_ENABLED=true|NODE_ENV=production"
ENVVARS="$ENVVARS|TREASURY_WALLET=$TREASURY_WALLET|PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
ENVVARS="$ENVVARS|SEAT_COUNT=${SEAT_COUNT:-24}|SEAT_FLOOR_USD=${SEAT_FLOOR_USD:-15}"
ENVVARS="$ENVVARS|MIN_INCREMENT_PCT=${MIN_INCREMENT_PCT:-0.10}|MIN_INCREMENT_USD=${MIN_INCREMENT_USD:-5}"
ENVVARS="$ENVVARS|MAX_BID_USD=${MAX_BID_USD:-100000}|SEAT_HOLD_MINUTES=${SEAT_HOLD_MINUTES:-5}"
ENVVARS="$ENVVARS|SEAT_PROTECT_MINUTES=${SEAT_PROTECT_MINUTES:-30}|SCOUT_ROUND_LIMIT=${SCOUT_ROUND_LIMIT:-24}"
# L'éditeur. Ce qui est vide n'est pas imprimé sur /terms, et tant que
# l'identité est incomplète la vente est fermée par le code.
ENVVARS="$ENVVARS|PUBLISHER_NAME=${PUBLISHER_NAME:-The Wall}|PUBLISHER_LEGAL_FORM=${PUBLISHER_LEGAL_FORM:-}"
ENVVARS="$ENVVARS|PUBLISHER_SIREN=${PUBLISHER_SIREN:-}|PUBLISHER_DIRECTOR=${PUBLISHER_DIRECTOR:-}"
ENVVARS="$ENVVARS|PUBLISHER_ADDRESS=${PUBLISHER_ADDRESS:-}|PUBLISHER_ADDRESS_ON_REQUEST=${PUBLISHER_ADDRESS_ON_REQUEST:-false}"
ENVVARS="$ENVVARS|PUBLISHER_VAT=${PUBLISHER_VAT:-}|PUBLISHER_CONTACT=${PUBLISHER_CONTACT:-contact@thewallsol.com}"
ENVVARS="$ENVVARS|MAIL_FROM=${MAIL_FROM:-}|MAIL_REPLY_TO=${MAIL_REPLY_TO:-contact@thewallsol.com}"
ENVVARS="$ENVVARS|SALES_REQUIRE_PUBLISHER=${SALES_REQUIRE_PUBLISHER:-false}"

echo "→ deploy (révision candidate, sans trafic)"
gcloud run deploy "$SERVICE" \
  --no-traffic --tag pre \
  --project "$PROJECT" --region "$REGION" --source . \
  --service-account "$SA" \
  --set-secrets "$SECRETS" \
  --set-env-vars "^|^$ENVVARS" \
  --allow-unauthenticated --min-instances 0 --concurrency 40 --timeout 30s

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')

if [ "$FIRST_RUN" = "1" ]; then
  echo "→ l'URL est $URL — on la repasse au service"
  gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --update-env-vars "PUBLIC_BASE_URL=$URL" >/dev/null
  echo "→ notez-la dans deploy.env pour les prochaines fois :"
  echo "     export PUBLIC_BASE_URL=$URL"
fi

CANDIDATE=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json \
  | jq -r '.status.traffic[] | select(.tag=="pre") | .url')
: "${CANDIDATE:?URL de la revision candidate introuvable}"

echo "→ preflight de la candidate — aucun trafic dessus pour le moment"
echo "   $CANDIDATE"
if ! ./scripts/preflight.sh "$CANDIDATE" \
      "$(gcloud secrets versions access latest --secret=gate-token --project "$PROJECT")" \
      "$(gcloud secrets versions access latest --secret=admin-token --project "$PROJECT" 2>/dev/null || true)"; then
  echo
  echo "✖ La candidate a echoue au preflight. Le trafic n a PAS bouge :"
  echo "  la version en ligne reste celle d'avant, intacte."
  echo "  Corrigez, puis relancez ce script."
  exit 1
fi

echo "→ preflight vert — bascule du trafic sur la nouvelle révision"
gcloud run services update-traffic "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --to-latest --remove-tags pre >/dev/null
echo "→ en ligne : $URL"

# Cloud Run est déjà en ligne et correct à ce stade. Firebase Hosting est
# une couche séparée devant lui (voir firebase.json) : sans cette étape,
# ses propres règles (headers, cache) ne sont jamais publiées, même quand
# elles changent dans ce dépôt. Un échec ici n'annule pas la bascule
# Cloud Run qui précède — il la laisse en l'état et s'arrête net.
echo "→ déploiement Firebase Hosting (firebase.json)"
if ! npx firebase deploy --only hosting --project "$PROJECT" --non-interactive; then
  echo
  echo "✖ Le déploiement Firebase Hosting a échoué."
  echo "  Cloud Run reste en ligne et correct (voir ci-dessus) : seule la"
  echo "  configuration Firebase Hosting (firebase.json) n'est pas publiée."
  echo "  Corrigez, puis relancez ce script — la partie Cloud Run rejouera"
  echo "  sans effet si rien n'a changé côté service."
  exit 1
fi
echo "→ Firebase Hosting à jour"
