# The Wall

Twenty-four numbered advertising seats on one page, bought in SOL, taken
from you by whoever pays more. Before a price is ever quoted, the server
reads the mint, the pool and the destination link.

**If it cannot establish a fact, it does not sell the seat.** Every rule is
published, and so is every refusal.

→ **[thewallsol.com](https://thewallsol.com)** · [the rules](https://thewallsol.com/rules) · [the refusal ledger](https://thewallsol.com/refused)

---

## The idea worth stealing

Most of this repository is an ordinary Node server. One part is not, and it
is the reason the rest exists.

A gate that screens things has two ways to say no, and they are not the
same sentence:

```
"We read the pool and the liquidity is not locked"   → a fact about the token
"We cannot read this DEX"                            → a fact about US
```

Both used to refuse, in the same words, and the public ledger published the
second as though it were the first — asserting something measured about a
named project that had never been measured at all.

So the screener has **four** verdicts, not two:

| verdict | what it means | sold? | published? |
|---|---|---|---|
| `incomplete` | a check could not run. Nothing established, so nothing claimed | no | **no** |
| `refused` | a hard rule failed on a fact we measured | no | yes |
| `flagged` | sellable, and the findings are printed on the seat | yes | on the seat |
| `clear` | every check passed | yes | badge only |

Everything else follows from that split. Pessimistic placeholders — `$0`
liquidity, `100%` held by one wallet, `unchecked` — exist to trip rules and
are never printed as measurements. Two limits are named as ours rather than
theirs: a DEX we have not modelled, and a mint with more holder accounts
than the chain call will return.

It is a small distinction. Getting it wrong is how a screening tool becomes
a machine that libels strangers politely.

## Rules the code enforces on itself

1. **`facts.js` is the only source of facts.** The public checkout accepts
   none from the request body — a gate that accepts the facts it is meant to
   check is not a gate.
2. **Every error path ends in a refusal or a hold.** Never in a sale.
3. **The screener never calls a model.** The test suite runs with no API
   key, no RPC key and no network. The day it needs one, the gate has drifted.
4. **Nothing is published that was not measured.**
5. **The account never vouches for a token.** It screens contracts nobody
   submitted and publishes the findings — but a contract that *passes* is
   never posted about, because "we checked this and it is fine" is an
   endorsement of a financial asset.
6. **Thresholds may only get stricter.** Passing the gate produces a sales
   lead, which creates a structural interest in more contracts passing. A
   test reads the production settings and fails the release if a threshold
   moved the other way.
7. **Nothing becomes autonomous by flipping a flag.** See `graduation.js`.

## Running it

```bash
npm test        # 269 tests. No keys, no network, no dependencies.
npm run dev     # http://localhost:8080
```

Node 20+, zero mandatory dependencies. Firestore is optional and lazily
loaded; storage falls back to memory or flat files. Without an RPC key the
gate refuses everything, which is the intended behaviour — to work on the
interface without a paid account:

```bash
NODE_ENV=development DEV_FACTS_FIXTURE=1 DEV_SOL_USD=180 \
AGENT_MODERATOR_ENABLED=false TREASURY_WALLET=<an address> npm run dev
```

Both of those are **inert the moment `NODE_ENV=production`**, and that is
tested (`test/security.test.js`).

## Map

```
src/
  server.js          HTTP routes, the checkout gate, the crons
  config.js          every knob, and the refusal to boot in prod without secrets
  facts.js           THE single source of facts
  wall.js            seats, takeover prices, holds, history
  payments.js        price in USD, payment in SOL, verified on chain
  pages.js           server-rendered pages — the half a crawler can read
  storage.js         memory | file | firestore, one interface
  guardrails.js      kill switches, banned phrasings, human queue, quotas
  graduation.js      an agent's autonomy, earned on evidence
  lib/net.js         outbound anti-SSRF fetch (the most important file here)
  solana/pool.js     lpUsd and lpLocked, proven or refused
  agents/
    screener.js      deterministic. No model, ever.
    moderator.js     the only agent inside checkout, and it only reads text
    scout.js         which contracts to check today. Proposes, decides nothing.
    poster.js        drafts posts. Never promotes.
public/              the site: the wall, the rules, the ledger, the back office
test/                the release gate — 269 tests, no key required
scripts/             preflight (against the deployed instance), deploy, scout
```

`DEPLOY.md` is the operational runbook, in French: infrastructure, the
Cloud Scheduler jobs, and a log of every trap this project has already
fallen into — including the ones that shipped.

## Status

Live and taking payments. The ledger is young. The wall is mostly empty.

## Licence

See [LICENSE](LICENSE).
