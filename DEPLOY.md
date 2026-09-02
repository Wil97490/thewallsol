# Mise en ligne

Ce document est écrit pour être suivi dans l'ordre. Tout ce que je ne peux
pas faire à votre place est marqué **[VOUS]** — ce sont des créations de
compte, des paiements, ou des décisions qui vous engagent.

---

## §1 — Les comptes à ouvrir **[VOUS]**

Cinq services. Deux sont payants, trois sont gratuits au démarrage.

| # | Service | Pourquoi | Coût réel |
|---|---------|----------|-----------|
| 1 | **Helius** (ou Triton / QuickNode) — RPC Solana | Le RPC public de Solana est trop lent et trop limité pour un checkout. Sans lui, le gate refuse tout. | Gratuit jusqu'à ~1M requêtes/mois, puis ~50 $/mois |
| 2 | **Google Cloud** — Cloud Run + Firestore + Secret Manager | L'hébergement. Firestore garde l'audit et la file de relecture. | ~5–15 $/mois à ce trafic |
| 3 | **Google Safe Browsing API** | Vérifie le lien de destination. Sans clé, **tout lien est refusé** (c'est voulu). | Gratuit |
| 4 | **Anthropic** — clé API | Modérateur, fil horaire, rapports. | ~5–20 $/mois. **Mettez une limite de dépense.** |
| 5 | **Un wallet Solana dédié** | Encaisse les sièges. Pas votre wallet personnel. | 0 |

### 1.1 Helius
1. Créez un compte sur helius.dev, projet en **Mainnet**.
2. Copiez l'URL RPC (elle contient votre clé — c'est un secret).

### 1.2 Google Cloud
1. Créez un projet, activez la facturation.
2. Activez : Cloud Run, Firestore, Secret Manager, Cloud Scheduler.
3. Créez la base Firestore en mode **Native**, région `europe-west1`.
4. Créez un compte de service `wall-agents@<projet>.iam.gserviceaccount.com`
   avec les rôles `Cloud Datastore User` et `Secret Manager Secret Accessor`.
   (Google impose 6 à 30 caractères : `wall` tout court est refusé.)

### 1.3 Safe Browsing
Dans le même projet GCP : activez « Safe Browsing API », créez une clé API,
restreignez-la à cette seule API.

### 1.4 Anthropic
console.anthropic.com → clé API → **et surtout** : Settings → Limits →
fixez un plafond mensuel. Un agent qui boucle sans plafond est une facture.

### 1.5 Le wallet trésorerie
Créez un wallet Solana **neuf**, dédié à l'encaissement. Notez la seed
phrase hors ligne. L'adresse publique va dans `TREASURY_WALLET` ; la clé
privée **n'entre jamais** dans ce dépôt — le serveur ne fait que vérifier
des transactions entrantes, il ne signe rien.

---

## §2 — Les secrets **[VOUS]**

```bash
export PROJECT=votre-projet-gcp

for s in anthropic-api-key gate-token admin-token solana-rpc-url safe-browsing-key; do
  gcloud secrets create $s --project $PROJECT --replication-policy=automatic
done

# GATE_TOKEN et ADMIN_TOKEN : deux secrets aléatoires, jamais réutilisés
# tr -d '\n' n'est pas optionnel : openssl termine par un retour à la ligne,
# et un secret qui en contient un donne une authentification qui échoue sans
# que rien ne l'explique nulle part.
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add gate-token  --project $PROJECT --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add admin-token --project $PROJECT --data-file=-

printf '%s' "sk-ant-..."                 | gcloud secrets versions add anthropic-api-key --project $PROJECT --data-file=-
printf '%s' "https://mainnet.helius..."  | gcloud secrets versions add solana-rpc-url    --project $PROJECT --data-file=-
printf '%s' "AIza..."                    | gcloud secrets versions add safe-browsing-key --project $PROJECT --data-file=-
```

---

## §3 — Déployer

Les réglages non secrets vivent dans `deploy.env`, à la racine. L'adresse de
trésorerie y est déjà posée ; il reste `PROJECT` et `PUBLIC_BASE_URL` à
remplir.

Une seule fois, avant le premier déploiement : `npx firebase login` **[VOUS]**
— une session interactive, dans un navigateur, sur le compte Google associé
au projet Firebase. Rien à installer : `firebase-tools` est déjà une
dépendance de développement du dépôt (`npm install` suffit).

```bash
# éditez deploy.env, puis :
npm run deploy
```

`deploy.sh` fait quatre choses, dans cet ordre, et s'arrête à la première
qui échoue : il lance les tests, il déploie Cloud Run, il rejoue la
checklist contre l'instance **déployée**, puis il publie `firebase.json`
sur Firebase Hosting. Il n'y a pas de `--force`.

Le service **refuse de démarrer** en production s'il manque `SOLANA_RPC_URL`,
`GATE_TOKEN`, `ADMIN_TOKEN`, `TREASURY_WALLET`, `SAFE_BROWSING_KEY`, ou si
`STORAGE_BACKEND=file`. Le message vous dit exactement ce qui manque.

### Domaine **[VOUS]**
Cloud Run → votre service → « Gérer les domaines personnalisés ». Ajoutez
l'enregistrement DNS chez votre registrar, puis mettez `PUBLIC_BASE_URL` à
jour et redéployez.

---

## §4 — Les tâches planifiées **[VOUS]**

Trois. Elles s'appellent avec le `GATE_TOKEN` en en-tête.

```bash
URL=$(gcloud run services describe wall --project $PROJECT --region europe-west1 --format='value(status.url)')
TOKEN=$(gcloud secrets versions access latest --secret=gate-token --project $PROJECT)

# Le fil horaire
gcloud scheduler jobs create http wall-tape --project $PROJECT --location europe-west1 \
  --schedule="5 * * * *" --uri="$URL/cron/tape" --http-method=POST \
  --headers="authorization=Bearer $TOKEN"

# Les rapports acheteurs, une fois par jour
gcloud scheduler jobs create http wall-reports --project $PROJECT --location europe-west1 \
  --schedule="0 8 * * *" --time-zone="Indian/Reunion" --uri="$URL/cron/reports" --http-method=POST \
  --headers="authorization=Bearer $TOKEN"

# Libère les sièges dont le paiement n'est jamais arrivé
gcloud scheduler jobs create http wall-expire --project $PROJECT --location europe-west1 \
  --schedule="*/5 * * * *" --uri="$URL/cron/expire" --http-method=POST \
  --headers="authorization=Bearer $TOKEN"
```

**L'e-mail n'est pas branché.** Les rapports sont générés et mis en file,
mais rien ne part tant que vous n'avez pas ouvert un compte Resend (ou
équivalent) et posé `RESEND_API_KEY` et `MAIL_FROM`. C'est volontaire : je
ne veux pas d'un envoi silencieux vers un domaine non vérifié.

---

## §5 — Le back-office

`https://<votre-url>/admin`, jeton = `ADMIN_TOKEN`.

C'est là que se fait le travail que personne ne peut automatiser :

- **La file de relecture.** Chaque sortie d'agent y arrive en attente. Tant
  que vous n'approuvez ou ne rejetez rien, **aucun agent ne peut graduer** —
  la graduation se calcule sur des sorties relues par un humain. C'était le
  trou du code d'origine : la file s'écrivait, rien ne la relisait jamais.
- **La graduation.** `tape` sort de supervision à 200 relectures et 90 %
  d'approbation ; `reporter` à 100 et 95 %. Une sortie bloquée par la liste
  de mots interdits rétrograde l'agent immédiatement, sur toutes les
  instances, et vous devez le réhabiliter à la main.
- **Le journal.** Chaque décision d'agent, horodatée.

---

## §6 — Avant d'ouvrir le mur

À faire dans l'ordre, et à ne pas sauter :

- [ ] `npm test` passe (101 tests)
- [ ] `./scripts/preflight.sh $URL $GATE_TOKEN` passe contre l'instance déployée
- [ ] **Un vrai transfert de bout en bout** : prenez le siège le moins cher
      avec votre propre wallet, vérifiez que le SOL arrive sur la trésorerie
      et que le siège s'attribue tout seul
- [ ] Un transfert **insuffisant** ne donne pas le siège (envoyez la moitié
      du montant et vérifiez que rien ne se passe)
- [ ] La limite de dépense Anthropic est posée
- [ ] `/admin` est accessible depuis votre téléphone — c'est là que vous
      traiterez la file, et ce sera rarement depuis un bureau
- [ ] Vous avez testé l'interrupteur : `AGENTS_ENABLED=false` puis
      redéploiement → le mur met tout en attente au lieu de vendre
- [ ] Les mentions légales et vos conditions de vente sont en ligne **[VOUS]** —
      voir §8

---

## §7 — Ce qui reste ouvert

Je préfère que ce soit écrit noir sur blanc plutôt que découvert en
production.

1. **Le nombre de détenteurs est un échantillon.** `getTokenLargestAccounts`
   renvoie les 20 premiers comptes. La concentration du plus gros wallet est
   donc exacte ; un « nombre de holders » réel demanderait un indexeur
   (Helius DAS, Birdeye). Aucune règle ne s'appuie dessus aujourd'hui —
   c'est pour ça.
2. **`lpLocked` ne connaît que deux preuves** : les DEX qui brûlent la LP à
   la migration (pump.fun), et la LP brûlée à l'incinérateur. Un lock chez
   un tiers (Streamflow, Jupiter Lock) sera refusé faute de preuve. Si vous
   voulez les accepter, il faut lire ces programmes — c'est une vraie
   journée de travail, pas une ligne de config.
3. **Le prix du SOL vient de deux sources publiques** (DexScreener puis
   Coinbase). Si les deux tombent, aucun prix n'est proposé et rien n'est
   vendu. C'est le bon comportement, mais vous verrez des « prix
   indisponibles » plutôt qu'un prix faux.
4. **Le rate limiting du checkout est par instance.** Le quota de dépense
   modèle, lui, est partagé via Firestore. Avec `--min-instances 1` et un
   trafic normal c'est suffisant ; à 10 instances, un attaquant obtient 10×
   la limite d'essais. Le passage en compteur Firestore est une petite
   modification dans `http.js`.
5. **Pas de remboursement automatique.** Si quelqu'un envoie trop, ou envoie
   après l'expiration du hold, le SOL est sur la trésorerie et le siège
   n'est pas attribué. Vous rembourserez à la main. Un flux de
   remboursement automatique demande une clé privée en ligne — je ne l'ai
   pas fait, et je vous déconseille de le faire.

---

## §8 — La partie juridique **[VOUS]**

Je ne suis pas juriste et ce qui suit n'est pas un avis juridique. Trois
points qui, à ma lecture, méritent votre attention avant d'encaisser le
premier euro :

- Vous vendez de **l'espace publicitaire**, pas un service financier. Le
  site le dit déjà partout (page « The rules », pied de page). Ne laissez
  personne, y compris vous, écrire une phrase qui ressemble à une
  recommandation — c'est exactement ce que la liste de mots interdits
  empêche les agents de faire.
- Encaisser en crypto dans le cadre d'une activité professionnelle a des
  conséquences comptables et fiscales en France. Parlez-en à votre
  expert-comptable avant l'ouverture, pas après.
- Il vous faut des mentions légales, des CGV (durée du siège, absence de
  remboursement, droit de refuser une entrée) et une politique de
  confidentialité si vous collectez des e-mails — ce que fait le champ
  optionnel du formulaire.

## La ronde du jour (v4.20)

Le mur ne se fait pas connaître en parlant de lui : il se fait connaître
en publiant des constats sur des contrats que le monde regarde déjà.
C'est le seul contenu que personne d'autre ne produit, et il arrive avec
son audience attachée — les détenteurs du ticker.

### En deux commandes

```bash
export WALL_URL=https://thewallsol.com
export ADMIN_TOKEN="$(gcloud secrets versions access latest --secret=admin-token --project "$PROJECT")"

./scripts/scout.sh              # la ronde : propose, n'enregistre rien
./scripts/scout.sh commit <MINT> <TICKER> [LIEN]   # publie celui que vous avez choisi
```

Ou depuis `/admin`, section « Qui vérifier aujourd'hui » — même chose,
avec les boutons Copier / Publier au registre.

### D'où viennent les candidats

Quatre listes publiques DexScreener, sans clé : boosts (top et récents),
publicités en cours, fiches revendiquées. Ce sont des projets qui
**paient déjà pour de l'attention** — c'est-à-dire le marché du mur.
Une source morte ne fait pas tomber la ronde ; elle est signalée.

### Ce que la ronde ne fait pas

- Elle n'enregistre rien. Le gate tourne en mode sec (`dry:true`).
- Elle ne publie jamais un contrat qui passe. Dire « ce token a l'air
  bien » est une recommandation, et le compte n'en fait pas.
- Elle ne publie pas un refus qui repose sur une limite de nos outils
  (DEX non modélisé, mint trop gros pour être échantillonné), ni un
  refus qui ne tient qu'au lien.
- Elle ne repropose pas deux fois le même contrat (`scout:seen`).

### Cadence

Un post par jour suffit, aux heures US. Le jour où l'un des contrats
passés à la ronde part en rug, le post horodaté d'avant devient la seule
pièce que vous n'aurez pas eu à écrire.

### La ronde en automatique

Une quatrième tâche Cloud Scheduler. Elle réveille l'instance, passe la
ronde, et **met le résultat en cache** — quand vous ouvrez `/admin` le
matin, le travail est déjà fait et affiché avec son horodatage.

```bash
gcloud scheduler jobs create http wall-scout --project $PROJECT --location europe-west1 \
  --schedule="0 12 * * *" --time-zone="Indian/Reunion" --uri="$URL/cron/scout" --http-method=POST \
  --headers="authorization=Bearer $TOKEN" --attempt-deadline=180s
```

`--attempt-deadline=180s` : la ronde passe cinq contrats à la chaîne, il
lui faut plus que les 30 s par défaut de Scheduler.

12 h à La Réunion = 8 h à New York, c'est-à-dire le début de la journée
du public visé. Changez l'heure, pas le fuseau : `Indian/Reunion` est
celui dans lequel vous lisez le résultat.

**Ce que la tâche ne fait pas, et ne fera jamais :** publier. Elle
n'enregistre aucun refus et ne poste rien. Elle prépare les brouillons ;
c'est vous qui cliquez « Publier au registre », un contrat à la fois.
Une machine qui nomme douze projets par jour toute seule n'est plus un
registre, c'est un canon.


### Ce que la ronde a appris en production (26/08/2026)

Premier tour réel : 4 candidats sur 5 marqués publiables. Tous les quatre
étaient des lancements pump.fun boostés, tous avec `young` + `lp_burn_only`.

C'était un défaut de conception, pas un seuil mal réglé. `lp_burn_only`
est vrai de **tout** ce qui sort du launchpad : c'est une propriété de la
plateforme, pas du projet dont le nom serait dans le post. Le dire une
fois est une observation ; le dire chaque jour sous un ticker différent,
c'est répéter la même phrase en changeant le nom de la personne qui se
tient dessous. Il reste affiché sous un siège **vendu**, où l'acheteur a
payé pour le détail ; il cesse d'être un motif de post.

Corrigé en même temps :
- `redirect` rejoint les constats faibles pour un probe — le lien vient
  de DexScreener, personne ne nous l'a soumis pour qu'on le juge.
- `pending` (relecture humaine) n'est plus étiqueté « refusé » dans le
  back-office. C'est un état **de notre côté**.
- **Un probe ne remplit plus la file de relecture.** La file est l'endroit
  où un acheteur attend une réponse ; la remplir de contrats que la ronde
  a croisés rend illisible la seule file qui doit être fiable.
- La ronde ne propose plus qu'**un seul** candidat publiable, le mieux
  classé. Les autres restent visibles en gris.
- Elle regarde 8 contrats au lieu de 5, puisqu'un vrai constat est rare.

**À quoi s'attendre maintenant : 0 ou 1 post par jour.** Zéro est une
réponse valable. Si c'est zéro toute une semaine, la réponse n'est pas
d'abaisser la barre — c'est que la population regardée (des lancements de
launchpad, propres par construction) ne peut presque rien enfreindre, et
il faut élargir les sources dans `SOURCES`.

### Les seuils, calibrés sur des vrais chiffres (26/08/2026)

Deuxième tour réel : 84 contrats vus, 81 valorisés, **1 retenu**. Le
plancher de volume à 25 000 $ était une supposition, et la distribution
l'a réfutée — un groupe de contrats réellement échangés se tenait entre
10 000 $ et 23 000 $, et la supposition coupait exactement là.

- `minVol24Usd` passe à **10 000 $**. Le plancher de 150 trades ne bouge
  pas et fait le vrai travail : les dollars sont la moitié facile à
  simuler, 150 transactions distinctes en 24 h sont une foule, petite
  mais réelle.
- La ronde publie maintenant **le décompte de ce qu'elle a écarté**, par
  motif, dans le back-office et dans `scout.sh`. La liste détaillée reste
  plafonnée à 40 lignes, le décompte non — un plafond qu'on ne voit pas,
  c'est ainsi que « nous avons écarté tout le marché » finit par se lire
  « le marché était calme ».

Attendez 5 à 6 retenus par ronde au lieu d'un. Toujours **0 ou 1 post**
par jour : la retenue est en aval, pas dans le filtre.

### Le volume dans le brouillon (v4.25)

Un constat porte ou pas selon ce à côté de quoi il est posé. « 2 057 $
dans la pool » est un petit chiffre sur une petite chose ; « 1,3 M$
échangés en 24 h dans une pool de 2 057 $ » est la même mesure qui fait
tout son travail.

`vol24Usd` devient donc un fait recueilli comme les autres — lu sur la
même réponse DexScreener que la profondeur, sans appel supplémentaire —
et il est stocké dans le registre pour que le brouillon reconstruit plus
tard dise la même chose que la ronde.

**Uniquement sur un refus.** Sur un contrat `signalé` le siège se vendrait,
et « 1,3 M$ échangés en 24 h » à côté d'une réserve modérée cesse d'être
du contexte pour devenir de la publicité gratuite pour un token que
personne n'a soumis. Le volume aiguise un refus ; il flatte tout le reste.

`/api/admin/screen` renvoie désormais le brouillon lui-même, et
`scout.sh` l'affiche au lieu de le reconstruire en jq — une seule
implémentation, pas de dérive entre la ligne de commande et le
back-office.

### La carte d'un refus (v4.26)

`public/js/card.js` savait déjà dessiner la carte d'une vente. Il dessine
maintenant celle d'un refus — bouton **Carte** sur les refus dans « Posts
prêts » et directement sur la ronde, avant même de publier au registre.

Deux dessins distincts, jamais un seul paramétré : une vente porte un
prix et une invitation à reprendre le siège, un refus ne porte ni l'un ni
l'autre. Le pied de carte distingue explicitement `nobody asked — we
checked anyway` de `submitted, and turned away` : ce sont deux affirmations
différentes, et une seule implique de l'argent.

Le volume n'apparaît que s'il a été mesuré. Une carte affichant
« $0 traded » pour un contrat dont on n'a pas su lire le marché serait le
même mensonge qu'un panneau affichant $0 pour une pool jamais ouverte.

## v4.27 — les pages de refus, les conditions, le mois

### `/refused/<ticker>` — une page par constat

Rendue **côté serveur**, complète à la première réponse. Le reste du site
est une coquille qui va chercher ses données ; une page qui doit exister
dans un index de recherche à la seconde où elle est écrite ne peut pas
l'être.

- Publication en un clic : « Publier au registre » crée la ligne, la
  ligne crée la page. Rien de plus à faire.
- L'adresse (`slug`) est décidée **à l'écriture**, jamais recalculée. Une
  URL indexée ne doit pas déménager parce qu'on a corrigé un ticker.
  Deux refus du même ticker ne s'écrasent pas.
- Retirer une ligne du registre renvoie **410 Gone**, pas 404 : elle a
  été publiée ici et retirée, et un registre qu'on peut effacer
  discrètement n'est pas un registre. Une adresse jamais publiée renvoie
  404 avec un texte différent — « retirée » et « n'a jamais existé » sont
  deux affirmations distinctes.
- L'adresse du contrat n'est **jamais** republiée. Testé.
- `sitemap.xml` est généré et contient le registre.

### `/terms` — conditions, remboursements, confidentialité

Écrites. **Les mentions légales sont à compléter** : l'éditeur doit être
identifié avant toute vente réelle. Les champs sont marqués
`[to be completed]` dans `public/terms.html`.

### Le récapitulatif mensuel

```bash
gcloud scheduler jobs create http wall-recap --project $PROJECT --location europe-west1 \
  --schedule="0 14 * * *" --time-zone="Indian/Reunion" --uri="$URL/cron/recap" --http-method=POST \
  --headers="authorization=Bearer $TOKEN"
```

La tâche tourne tous les jours et ne fait le travail que le dernier jour
du mois — une ligne de cron au lieu de douze. Le brouillon attend dans le
back-office, section « Récapitulatif ».

Le compte de contrats vérifiés vient du journal d'audit, qui est plafonné
et tourne. Quand la fenêtre ne couvre pas le mois, il revient plus petit
que ce qu'il est censé contenir — et « 0 contrats vérifiés, 12 refusés »
est un mensonge visible. La ligne est alors **supprimée**, pas ajustée.

### Le vérificateur public : retiré (v4.28)

Il a existé une heure. Retiré à la demande, et la raison est la bonne :
chaque vérification consomme quatre appels RPC Helius sur la clé que la
caisse utilise pour vendre des sièges. Un outil gratuit ouvert à tous
transforme un poste de coût fixe en poste variable non maîtrisé, et le
premier à en souffrir serait le paiement d'un acheteur réel.

Les plafonds que j'avais posés (10/IP/heure, 400/jour) bornaient la
casse, ils ne la supprimaient pas. Un outil dont le mode dégradé consiste
à fermer n'est pas un outil sur lequel on construit une acquisition.

Si la question revient : la version qui tient économiquement est un check
réservé à un acheteur pendant son checkout, pas un service public.

## v4.29 — la liste de prospects

La ronde mesurait déjà quels contrats **obtiendraient** un siège, et les
jetait avec « le mur ne se porte pas garant ». C'est juste pour la
publication et absurde commercialement : un projet qui passe nos checks,
qui a du volume, et qui paie déjà DexScreener pour de la visibilité est
la définition d'un prospect qualifié.

Section « Qui démarcher » dans `/admin` : les contrats `clear` et
`flagged` de la ronde, avec les liens que DexScreener expose (X, Telegram,
site) et un message prêt à copier. **Rien n'est publié, rien n'est envoyé,
rien n'est automatique.** Un bouton « Marquer contacté » raye la ligne —
c'est une rature, pas un CRM.

Le message dit ce que notre porte a décidé, jamais ce que vaut leur
token. Et un contrat `flagged` est prévenu du flag **avant** d'acheter :
un siège qui apparaît avec une ligne dont personne ne l'avait averti est
une demande de remboursement, et une demande légitime.

### Le conflit d'intérêt, et le verrou

À partir du moment où passer le gate produit un prospect, il existe un
intérêt structurel à ce que davantage de contrats passent. Le screener
est déterministe et publié, donc cet intérêt ne peut pas atteindre un
verdict — mais il peut atteindre **celui qui édite les seuils**, et le
jour où ça arrivera, ça ressemblera à de la croissance.

`test/scout.test.js` épingle donc les seuils de production lus dans
`deploy.env`. Assouplir `MAX_TOP_HOLDER_PCT`, `MIN_LP_USD`,
`FLAG_LP_USD`, `FLAG_AGE_HOURS` ou `FLAG_TOP_HOLDER_PCT` fait **échouer
le gate de release**. Un seuil peut devenir plus strict, jamais plus
large. Vérifié : le test tombe bien quand on essaie.

## v4.30 — le film sur la page d'accueil

Dix-sept secondes entre l'accroche et le mur : trois contrats réels
passés au gate, deux refusés, un vendu avec ses réserves imprimées
dessus. C'est ce qu'un visiteur arrivé d'un post X doit comprendre en
cinq secondes, et le texte seul ne le fait pas.

**Décoratif au sens strict.** Tout ce que le film dit est déjà écrit
au-dessus et sur `/rules`. Quelqu'un qui ne le voit jamais — lecture
automatique bloquée, mouvement réduit, connexion lente — ne perd rien.

- `muted playsinline loop` : sans ces trois-là, iOS ne lit rien.
- `preload="none"` + IntersectionObserver : 250 ko ne partent pas pour un
  visiteur qui n'a jamais fait défiler jusque-là.
- `prefers-reduced-motion: reduce` → il ne démarre pas. Ce n'est pas une
  préférence esthétique : une boucle de dix-sept secondes rend certaines
  personnes malades.
- L'affiche s'arrête **avant** le verdict. Les commandes du lecteur se
  posent en bas du cadre et écrasaient le tampon, et donner la chute sur
  l'affiche retire toute raison d'appuyer sur lecture.

### Le `-1` dans le nom de fichier

Les médias sont servis `public, max-age=31536000, immutable`. C'est
correct **uniquement** si un fichier modifié change de nom. Remplacer
`how-it-works-1.mp4` sur place le rendrait invisible jusqu'en 2027 pour
tous ceux qui l'ont déjà chargé.

Refaire le film : `how-it-works-2.mp4` et `-2.jpg`, deux lignes dans
`public/index.html`. Le preflight lit le nom demandé par la page
d'accueil et vérifie que le fichier existe — un film absent ne se voit
autrement qu'à l'œil, sur un cadre cassé, chez chaque visiteur.

Sources du film : `film.html` (chaque plan est une entrée du tableau
`CARDS`) et `render-film.mjs`, hors dépôt.

## v4.31 — la CSP mangeait les scripts en ligne

La lecture automatique ne démarrait pas sur ordinateur. La cause n'était
pas la vidéo : **`script-src 'self'` refuse tout script en ligne**, et le
script de lecture vivait dans une balise `<script>` au milieu du HTML. Il
n'a jamais tourné une seule fois.

Le même défaut avait été livré en v4.27 sans que personne ne le voie : le
script de thème des pages rendues côté serveur (`/refused/...`) était
inline lui aussi. Ces pages s'affichaient toujours dans le thème par
défaut, quel que soit le choix du visiteur ailleurs sur le site.

C'est la pire forme de bug de ce projet : **le navigateur refuse en
silence, le serveur répond 200, les tests passent, et la fonctionnalité
est simplement absente.** Un en-tête de sécurité ne prévient pas le
serveur qu'il vient de casser une page.

- `public/js/theme.js` et `public/js/film.js` : externes, chargés par URL.
- `theme.js` est chargé **sans `defer`** dans le `<head>` : il doit poser
  l'attribut avant le premier rendu, sinon la page s'allume en clair puis
  bascule.
- Quatre tests interdisent désormais tout `<script>` inline, dans les
  pages statiques comme dans les pages rendues. Seul
  `application/ld+json` reste autorisé : c'est une donnée, pas du code.
- Le preflight refait la même vérification **sur l'instance déployée** :
  les fichiers peuvent être justes et le serveur en livrer d'autres.

### Le film passe en 16:9

Un carré sur une page large ressemble à un post social collé dessus.
`film.html` produit maintenant deux compositions à partir du même
montage — ce ne sont pas deux mises à l'échelle :

- **1080×1080** pour X : ticker, mesures et tampon empilés, ce qui se lit
  sur un téléphone.
- **1600×900** pour le site : ticker et verdict à gauche, mesures à
  droite, tout centré verticalement.

`node render-film.mjs` sort les deux d'un coup.

### Une source WebM en plus

Certains navigateurs sont livrés sans décodeur H.264 — le Chromium de
test en fait partie, ce qui a permis de s'en rendre compte. Le `<video>`
propose donc `mp4` d'abord (le seul que Safari et iOS lisent) puis
`webm`. 215 ko, aucune raison de s'en priver.

## v4.32 — validation Google Search Console

Propriété `https://thewallsol.com/` créée dans la Search Console, en
attente de validation par fichier HTML.

`public/googlebcc882ef153fa8c5.html` contient une seule ligne :

```
google-site-verification: googlebcc882ef153fa8c5.html
```

**Ne le supprimez jamais**, même après validation. Google révoque la
propriété si le fichier disparaît, et ne prévient personne : le site sort
de la Search Console en silence, et vous ne le découvrez que le jour où
vous allez voir vos statistiques. Un test et une sonde du preflight le
gardent en place.

Une fois déployé, il reste à cliquer VALIDER dans la Search Console puis
à soumettre `sitemap.xml`.

## v4.33 — le dépôt, prêt à être public

`README.md` est réécrit en anglais et pour un lecteur extérieur : il mène
par la distinction à quatre verdicts, pas par l'argumentaire commercial.
C'est la seule partie du projet qui intéresse quelqu'un qui ne veut pas
acheter de siège, et c'est donc la seule qui puisse rapporter un lien.

Vérifié avant publication : aucun secret dans le dépôt. `deploy.env` ne
contient que des valeurs publiques par nature (wallet de trésorerie, ID de
projet GCP, URL). Les cinq secrets vivent dans Secret Manager et n'ont
jamais été écrits dans un fichier versionné.

Reste à choisir une licence et à pousser — voir la fin de ce fichier.

### Publier le dépôt (une fois)

Licence MIT. Depuis Cloud Shell, dans `~/wall` :

```bash
gh auth login                      # une fois, dans le navigateur
git init && git add -A
git commit -m "The Wall — twenty-four seats, none sold without a check"
gh repo create thewallsol --public --source=. --push \
  --description "Twenty-four advertising seats. None sold without a check, and every refusal published."
```

Puis, sur la page du dépôt, mettez `https://thewallsol.com` dans le champ
**Website** — c'est le lien qui compte pour l'indexation.

Vérifié avant publication : aucun secret versionné. `data/` et
`.scout.env` sont désormais dans `.gitignore`.

## v4.34 — la page token, en divulgation

L'équipe a lancé **$Wall** sur pump.fun le 26/08/2026 et en détient ~9,39 %.
`/rules#no-token` affirmait le contraire et est resté en ligne une journée.
C'est la seule ligne fausse qu'un site qui contrôle des contrats ne peut
pas se permettre.

`/rules#token` la remplace : le lancement, le pourcentage détenu, l'adresse
du contrat **en toutes lettres**, ce que le token ne donne pas, et ce que le
raisonnement « on l'a sorti avant les copies » vaut réellement — la page dit
elle-même que c'est l'argument de tout le monde et que les copies sont
arrivées quand même. Une justification affaiblit une divulgation ; on a
gardé la raison et retiré la défense.

**L'adresse est écrite, jamais liée.** La page sert à vérifier ce que
l'équipe détient, pas à faciliter un achat. Un test interdit tout lien vers
pump.fun depuis les pages du site.

**Le mint est dans `EXCLUDED_MINTS`.** Le token de l'équipe ne peut ni
entrer dans une ronde, ni obtenir un siège, ni être noté par ce gate. Un
outil de contrôle qui note la chose que son opérateur détient n'en est plus
un, quel que soit le verdict. Exclu dans le code plutôt que retenu de
mémoire : « on ne le ferait jamais » n'est pas un mécanisme.

Deux tests et deux sondes de preflight empêchent le retour de l'ancienne
affirmation et la disparition de la nouvelle.

Section « Ideas are welcome » ajoutée : e-mail et DM X.

## Firebase Hosting — le routage du domaine

`firebase.json`, à la racine, est ce qui met thewallsol.com devant Cloud Run :
toute requête (`**`) est réécrite vers le service `wall` en europe-west1.
Sans ce fichier, le domaine ne pointe sur rien.

Il ne part PAS avec `./scripts/deploy.sh`, qui ne déploie que Cloud Run — les
deux sont indépendants. Ce fichier n'a besoin d'être renvoyé que si vous
changez le routage lui-même (nouveau service, autre région, règles ajoutées).

Il a vécu ses premières semaines dans un dossier `~/wall-hosting` sur un seul
Cloud Shell, sauvegardé nulle part. Il est ici pour être versionné avec le
reste : une pièce d'infrastructure dont dépend le site ne doit pas exister en
un seul exemplaire sur une machine jetable.
