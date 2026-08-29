/* ------------------------------------------------------------------ *
 * THE CHECKS, EXPLAINED — one page per thing we measure.
 *
 * Why this file exists, and what it is not.
 *
 * The refusal ledger prints a finding and a threshold. That is enough
 * to be honest, and not enough to be useful: somebody who lands on
 * /refused/pistacio after typing a ticker and the word "rug" into a
 * search box cannot tell whether "mint authority is still open" is a
 * catastrophe or a footnote, and has no way to check it themselves.
 *
 * So each of these pages answers three questions in this order:
 *
 *   1. What is this, in one paragraph, for someone who has never read
 *      an SPL mint account.
 *   2. HOW DO YOU CHECK IT YOURSELF. A command they can paste. This is
 *      the part that matters. A site that says "trust our checks" is
 *      worth nothing; a site that hands you the call it made is worth
 *      reading. Everything here is verifiable against a public RPC,
 *      without an account and without us.
 *   3. What our threshold is, and — the sentence most of these pages
 *      exist for — what the measurement does NOT establish.
 *
 * The last one is not decoration. Every check on this list has a
 * failure mode where it says something true about the chain and
 * something false about the project, and each page names its own.
 *
 * THE MESH. Each refusal page links its findings here, and each page
 * here links back to the rules and the ledger. That is deliberate: the
 * ledger grows on its own every night, so the reference pages gain
 * incoming links without anybody writing anything. Six essays nobody
 * links to are worth nothing.
 *
 * NOTHING HERE MAY DRIFT FROM THE SCREENER. The thresholds printed on
 * these pages come from config, not from prose — see pages.js. If a
 * number is hardcoded in a paragraph below, it is wrong.
 * ------------------------------------------------------------------ */

/** The public endpoint used in every example. No key, no account. */
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

const rpcCall = (method, params) =>
  `curl -s ${PUBLIC_RPC} -X POST \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"${method}","params":${params}}'`;

export const CHECKS = [
  /* ---------------------------------------------------------------- */
  {
    slug: "mint-authority",
    nav: "Mint authority",
    title: "Mint authority on Solana: how to check whether more tokens can be created",
    h1: "Can more of this token <em>be created?</em>",
    lede: "Every SPL token has a field that says who is allowed to create more of it. If that field still holds an address, the person behind it can mint more supply at any moment, without asking anyone and without warning. This is the first thing we look at, and the cheapest thing on this page for you to check yourself.",
    ruleIds: ["mint_authority"],
    outcome: "refused",
    outcomeLine: "An open mint authority is a refusal. There is no tolerance band and no size at which we make an exception.",
    what: [
      "A token on Solana is an account of type <em>mint</em>. Among its fields is <code>mintAuthority</code>: the single address permitted to increase the supply. When a project is finished issuing, it sets that field to null — the operation is called revoking, it is irreversible, and it costs one transaction.",
      "Until it is revoked, the number printed on every chart is a number somebody can change. Not a prediction about their character; a fact about what the program permits.",
    ],
    verify: {
      intro: "One call. Replace <code>MINT</code> with the contract address.",
      command: rpcCall("getAccountInfo", `["MINT",{"encoding":"jsonParsed"}]`) +
        ` \\
  | grep -o '"mintAuthority":[^,]*'`,
      reading: [
        [`"mintAuthority":null`, "Revoked. The supply is fixed. This is what we require."],
        [`"mintAuthority":"7xKX…"`, "Still open. Whoever holds that key can mint more supply."],
      ],
      note: "The public endpoint above is rate-limited and occasionally slow; it is not a fast way to check a hundred tokens, and it is a perfectly good way to check one. Any Solana explorer shows the same field.",
    },
    limits: [
      "This tells you the authority is revoked. It does not tell you when it was revoked, or how much was minted before. A supply that was inflated last week and frozen yesterday reads exactly like a supply that was never touched.",
    ],
    not: [
      "<strong>Open mint authority is not proof of intent.</strong> Plenty of tokens sit with the authority open for weeks because nobody got around to it. Our rule refuses those too — not because they are dishonest, but because we sell advertising space and cannot print <em>SCREENED</em> next to a supply that could double while the seat is live.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "freeze-authority",
    nav: "Freeze authority",
    title: "Freeze authority on Solana: how to check whether holders can be locked out",
    h1: "Can holders be <em>frozen out?</em>",
    lede: "The second field on the same account, and the less discussed one. Freeze authority lets whoever holds it disable individual token accounts — the holder still owns the balance and can no longer move it. It is the mechanism behind a large share of the exits that do not look like exits.",
    ruleIds: ["freeze_authority"],
    outcome: "refused",
    outcomeLine: "An open freeze authority is a refusal, on the same terms as the mint authority.",
    what: [
      "<code>freezeAuthority</code> sits beside <code>mintAuthority</code> on the mint account. When set, the address it names can freeze any token account holding this mint. Frozen means: the balance is visible, the balance is yours, and no transfer will succeed.",
      "It has legitimate uses — regulated assets, tokens with transfer restrictions by design. On a memecoin whose entire pitch is that anyone can trade it, an open freeze authority contradicts the pitch.",
    ],
    verify: {
      intro: "The same call as the mint authority, reading the other field.",
      command: rpcCall("getAccountInfo", `["MINT",{"encoding":"jsonParsed"}]`) +
        ` \\
  | grep -o '"freezeAuthority":[^,]*'`,
      reading: [
        [`"freezeAuthority":null`, "Revoked. No account can be frozen. This is what we require."],
        [`"freezeAuthority":"7xKX…"`, "Still open. That address can freeze any holder's account."],
      ],
    },
    limits: [
      "A revoked freeze authority says nothing about transfer hooks or the Token-2022 extensions, which can restrict transfers by other means entirely. We do not currently read those, and we do not claim to.",
    ],
    not: [
      "<strong>This is not a judgement about the team.</strong> It is a fact about what the program allows. We refuse the seat because we would otherwise be selling advertising for a token whose holders can be silenced by one transaction, and printing our badge under it.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "liquidity-lock",
    nav: "Liquidity lock",
    title: "Liquidity lock on Solana: how to prove the pool cannot be pulled",
    h1: "Can the pool <em>be pulled?</em>",
    lede: "The pool is what you sell into. Whoever holds the LP tokens for it can withdraw everything in it, in one transaction, at any time — which is what a rug is, mechanically. So the question is not whether the pool is deep. It is whether anybody still holds the key to it.",
    ruleIds: ["lp_unlocked", "lp_burn_only", "lp_lock_unverifiable", "pool_unread"],
    outcome: "refused",
    outcomeLine: "A pool we read and found unlocked is a refusal. A pool on a DEX our checks do not model is a flag, never a refusal — the gap is ours. A pool we could not read at all holds the sale and publishes nothing.",
    what: [
      "Depositing into a Solana AMM mints you LP tokens representing your share. Burning them — sending them to the incinerator address, from which nothing returns — makes the withdrawal permanently impossible. That is the only form of lock we accept as proven.",
      "We prove it two ways. Either the pool sits on a launchpad AMM that burns LP at migration by construction, in which case there is nothing to hold. Or we read the LP mint ourselves and check how much of its supply is parked at <code>1nc1nerator11111111111111111111111111111111</code>.",
      "Anything else — a third-party locker, a vesting contract, a DEX we have not modelled — comes back <em>unproven</em>. Unproven is not the same sentence as unlocked, and this site is careful never to print the second when it measured the first.",
    ],
    verify: {
      intro: "Two steps. First find the deepest Solana pair and its DEX; then read the LP mint's supply and see how much of it is burnt.",
      command: `# 1. the pool, its depth and which AMM it is on
curl -s https://api.dexscreener.com/latest/dex/tokens/MINT \\
  | jq '[.pairs[] | select(.chainId=="solana")]
        | max_by(.liquidity.usd)
        | {dexId, pair: .pairAddress, liquidity: .liquidity.usd}'

# 2. for the LP mint of that pair, who holds the LP tokens
${rpcCall("getTokenLargestAccounts", `["LP_MINT"]`)} \\
  | jq '.result.value[] | {address, amount: .uiAmountString}'`,
      reading: [
        ["dexId is pumpswap, pumpfun or moonshot", "The launchpad burns LP at migration. Nothing to pull, and no second step needed."],
        ["The largest LP holder is 1nc1nerator11…", "The LP tokens were burnt. The pool cannot be withdrawn."],
        ["A normal wallet address holds the LP supply", "Somebody can withdraw the pool. This is the case our hard rule refuses."],
      ],
      note: "The LP mint address is not on the DexScreener response; for Raydium pools it comes from their pool API, which is the call our own checks make. This is the fiddliest check on the site to reproduce by hand, and the one most worth reproducing.",
    },
    limits: [
      "A launchpad burn and an independent lock are not the same guarantee, so a pool that is locked only because the launchpad burnt it is flagged rather than passed silently. It is the single most common flag in the nightly round.",
      "We model a small number of AMMs. A pool on anything else comes back unverifiable — a fact about our coverage, not about the project — and is sold with the gap stated rather than refused.",
    ],
    not: [
      "<strong>A locked pool is not a safe token.</strong> It means one specific exit is closed. The supply can still be concentrated, the authorities can still be open, and nothing about a lock prevents a price going to zero the ordinary way.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "holder-concentration",
    nav: "Holder concentration",
    title: "Holder concentration on Solana: how to check what one wallet holds",
    h1: "How much sits in <em>one wallet?</em>",
    lede: "If a single holder is sitting on a large share of the float, the chart is a description of their intentions. This check reads the largest accounts and asks how much the biggest human-controlled one holds — and the interesting half of it is what it excludes.",
    ruleIds: ["whale", "concentrated", "holders_unread", "holders_unmeasurable"],
    outcome: "refused",
    outcomeLine: "Over our ceiling in one wallet is a refusal. A smaller but still notable share is a flag printed under the seat. Holders we could not read at all assert nothing.",
    what: [
      "<code>getTokenLargestAccounts</code> returns the twenty largest token accounts for a mint. Token accounts, not people: one wallet can hold several, and most of the largest ones on a healthy token are not wallets at all.",
      "So the raw list is close to useless. A pool vault holding sixty percent of supply is the pool working correctly; the same number in a person's wallet is the float sitting on a hair trigger. Reading the first as the second is the mistake that makes automated holder checks worthless, and it is the one we made on our first two real tokens.",
      "The fix is arithmetic rather than heuristic: resolve each account's owner, and drop every owner whose address is off the ed25519 curve. An off-curve address is program-derived — a vault, an escrow, a locker — and nobody holds its private key. Also dropped: the incinerator, and the known system holders.",
      "And here is what this check does not see. The ceiling is tested against one wallet. A position split across fifteen wallets, each below the ceiling, holds the same share of the float and passes  the arithmetic is per address, and an address costs nothing to create. On 29 August 2026, the team behind a Solana token sold 224,500,000 tokens through fifteen freshly created wallets (reported by Lookonchain). We did not run our checks on that token, and this is not a claim about what we would have found: it is a description of a hole in the rule above. Closing it means clustering addresses by how they were funded, which is a different measurement, and not one we run today.",
    ],
    verify: {
      intro: "Two calls: the largest accounts, then who owns them.",
      command: `# 1. the twenty largest token accounts
${rpcCall("getTokenLargestAccounts", `["MINT"]`)} \\
  | jq '.result.value[] | {address, amount: .uiAmountString}'

# 2. who owns them — feed the addresses from step 1 back in
${rpcCall("getMultipleAccounts", `[["ACCOUNT_1","ACCOUNT_2"],{"encoding":"jsonParsed"}]`)} \\
  | jq '.result.value[].data.parsed.info.owner'`,
      reading: [
        ["An owner that is a pool vault or locker", "Exclude it. It is not a holder, and counting it invents a whale that does not exist."],
        ["A plain wallet holding a large share of supply", "This is the number the rule tests, against the ceiling published on the rules page."],
        ["Several plain wallets, each under the ceiling", "The rule reads them one at a time and finds nothing. Whether they are one holder is a question about how they were funded, which this check does not ask."],
        ["\"too many accounts\" from the RPC", "The method refuses past a certain size. That is a limit of the call, not concentration — see below."],
      ],
      note: "Whether an address is on the ed25519 curve is not something the RPC will tell you; it is a property of the bytes. Any Solana SDK exposes it as <code>PublicKey.isOnCurve</code>.",
    },
    limits: [
      "Twenty accounts is a sample, not a census. It catches one wallet sitting on the float, which is what the hard rule is for. It will not catch a hundred wallets holding one percent each, and we do not claim it does.",
      "Past a certain number of holder accounts the RPC refuses the call outright. When that happens the mint is <em>unmeasurable</em>, not concentrated — and a token is never refused for being larger than the method used to read it.",
    ],
    not: [
      "<strong>A large holder is not necessarily an insider.</strong> It can be an exchange, a market maker, or a bridge. Our rule refuses the seat anyway, because from the outside those look identical and we would rather turn away a legitimate token than print a badge we cannot defend.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "pool-depth",
    nav: "Pool depth",
    title: "Pool depth on Solana: how much liquidity is actually behind a token",
    h1: "How much is actually <em>behind it?</em>",
    lede: "Pool depth is the money standing between a sell order and the floor. It is the number most easily confused with market cap, and the difference between the two is where most of the disappointment on this chain lives.",
    ruleIds: ["lp_thin", "thin_pool", "no_pool"],
    outcome: "refused",
    outcomeLine: "Under our floor is a refusal. Above the floor but under the flag line is a flag printed under the seat. No Solana pool at all is a refusal of its own kind — there is nothing to trade against.",
    what: [
      "A fully diluted valuation of eight million dollars sitting on a four thousand dollar pool is not an eight million dollar token. It is a four thousand dollar pool with a large number written above it. Selling any meaningful position into that pool moves the price through the floor before the order fills.",
      "We read the deepest Solana pair for the mint and take its liquidity in dollars. Deepest, not first: a token with pools on three AMMs is judged on the one that could actually absorb a trade.",
    ],
    verify: {
      intro: "One call, no key.",
      command: `curl -s https://api.dexscreener.com/latest/dex/tokens/MINT \\
  | jq '[.pairs[] | select(.chainId=="solana")]
        | max_by(.liquidity.usd)
        | {dexId, liquidity: .liquidity.usd, volume24h: .volume.h24, fdv}'`,
      reading: [
        ["liquidity under the published floor", "The pool cannot absorb a real order. This is the refusal."],
        ["fdv far above liquidity", "Ordinary on this chain, and worth understanding before reading a chart as a valuation."],
        ["pairs: [] or no Solana pair", "There is nothing to trade against at all."],
      ],
    },
    limits: [
      "This is depth at one moment. A pool can be filled the hour after it is read, or drained. Every measurement we publish carries the timestamp it was taken at, for exactly this reason.",
      "We take the figure from market data rather than reading the vault balances ourselves. When that data is unavailable, the check did not run — the sale is held and nothing is published.",
    ],
    not: [
      "<strong>A thin pool is not a scam.</strong> Every token starts thin. It means the seat cannot carry our badge, not that anyone did anything wrong — which is why depth alone produces a flag well before it produces a refusal.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "pair-age",
    nav: "Pair age",
    title: "Pair age: how long a Solana token has actually been trading",
    h1: "How long has it <em>been trading?</em>",
    lede: "The softest check on the list, and the one that correlates with the most disappointment. Age does not measure quality. It measures how much time a token has had to demonstrate anything at all.",
    ruleIds: ["young"],
    outcome: "flagged",
    outcomeLine: "A pair younger than our flag line is never a refusal. It is a flag, printed under the seat, so the reader knows what they are looking at.",
    what: [
      "Every pair carries a creation timestamp. Subtract it from now and you have the entire trading history of the thing. On a pair four hours old, every chart pattern, every holder count and every volume figure describes four hours.",
      "We flag rather than refuse because being new is not a finding against anybody. It is the state every token passes through, including the ones that turn out to be fine.",
    ],
    verify: {
      intro: "The same call as pool depth, reading the timestamp.",
      command: `curl -s https://api.dexscreener.com/latest/dex/tokens/MINT \\
  | jq '[.pairs[] | select(.chainId=="solana")]
        | max_by(.liquidity.usd)
        | {created: (.pairCreatedAt/1000 | todate),
           hours: ((now - .pairCreatedAt/1000) / 3600 | floor)}'`,
      reading: [
        ["hours under the published flag line", "Young. Flagged, and stated on the seat rather than hidden."],
        ["A creation date older than the project's own account", "Worth a second look — a recycled pair is not the same thing as a new one."],
      ],
    },
    limits: [
      "Pair age is not token age. A mint can predate its deepest pair by months, and a pair can be recreated on a new AMM, resetting the clock on a token that has been trading all along.",
    ],
    not: [
      "<strong>New is not bad.</strong> This flag exists so that a reader looking at our wall knows how much history is behind what they are reading, not to suggest that a young token is a dishonest one.",
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "destination-link",
    nav: "Destination link",
    title: "The destination link: where an advertising seat actually sends people",
    h1: "Where does the seat <em>actually send you?</em>",
    lede: "The other five checks are about the contract. This one is about the advertisement. A seat on this wall is a link, and a link is the only part of the arrangement that can reach into somebody's browser — so it is checked separately, and it fails in more interesting ways than the rest.",
    ruleIds: ["link_dead", "link_threat", "link_no_answer", "link_unverified", "redirect", "link_uncheckable", "link_absent"],
    outcome: "refused",
    outcomeLine: "A destination that is gone, or that a safety service has flagged, is a refusal. A destination that answers evasively, or redirects before it lands, is a flag. A destination we could not submit for a check asserts nothing at all.",
    what: [
      "We fetch the destination and record what it answered, we follow redirects and record where it ended up, and we submit the final URL to a safety service. Three separate facts, kept separate on purpose, because they mean three different things.",
      "The distinction that costs the most to get right is between a link that is broken and a link that declined to answer us. Half the legitimate web sits behind a bot filter that returns 403 to anything without a browser. That is not a dead link — it is a link we could not confirm, which is a flag and a sentence, not a refusal.",
    ],
    verify: {
      intro: "Follow it yourself and watch where it lands.",
      command: `# what it answers, and every hop on the way
curl -sI -L -o /dev/null -w '%{http_code}  %{url_effective}\\n' 'https://EXAMPLE'

# every redirect in the chain
curl -sIL 'https://EXAMPLE' | grep -i '^location:'`,
      reading: [
        ["404, 410 or 5xx", "Gone or broken. A dead advertisement, and a refusal."],
        ["403 or another 4xx", "It declined to answer us. Flagged and stated, not refused."],
        ["A url_effective on a different domain", "It redirects before it lands. Flagged, with the final host named."],
        ["No answer at all", "Could be their host, could be our egress. Stated as such, and never published as a finding about them."],
      ],
      note: "The safety-service half of this check needs an API key and cannot be reproduced with curl alone. Google's Safe Browsing site status page will tell you what it holds on a URL without one.",
    },
    limits: [
      "A link that is clean at the moment of purchase can change afterwards; the destination is not ours and we do not control what it serves tomorrow.",
      "When a link was never supplied, nothing is checked and nothing is claimed. This distinction was learnt the hard way: we once published a refusal against a token with eleven million dollars of daily volume, whose stated finding was that no link had been supplied — by us, about a contract nobody had submitted. An absence is not a discovery.",
    ],
    not: [
      "<strong>A clean link is not an endorsement of what is behind it.</strong> It means the destination resolved and was not flagged at the moment we looked. We do not review the content of anybody's site.",
    ],
  },
];

/** ruleId → slug. Built from the table so the two can never disagree. */
export const RULE_TO_CHECK = Object.fromEntries(
  CHECKS.flatMap((c) => c.ruleIds.map((id) => [id, c.slug]))
);

export const CHECK_BY_SLUG = Object.fromEntries(CHECKS.map((c) => [c.slug, c]));
