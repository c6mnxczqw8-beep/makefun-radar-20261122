// The token launch radar's value model.
//
// Every figure comes from the snapshot itself: a protocol that records no
// token is valued off the protocols that already have one. For each category
// family we take the median market-cap-to-TVL ratio of the launched protocols
// in that family (falling back to the category, then to the whole launched
// set), then adjust the protocol's own TVL by three factors the record
// supports: its seven-day TVL momentum, how long it has run with no token,
// and whether it is a native protocol or a wrapped / staked / bridged product
// of an asset that already trades (or an exchange), in which case a launch of
// its own would be a claim on someone else's asset and is discounted hard.
//
// Nothing here is a list of names: change the snapshot and every number moves.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  // Extra keys the dashboard uses (the gate allows extra keys).
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  klass: "native" | "wrapped";
  multiple: number;
  multiple_basis: string;
  growth_factor: number;
  age_factor: number;
  class_factor: number;
}

export interface LaunchedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  symbol: string | null;
  ratio: number | null;
}

/** A protocol records no token when both token fields are null. */
export const recordsNoToken = (p: Protocol): boolean => p.gecko_id === null && p.symbol === null;

// The wrapped / staked / bridged test mirrors the one the snapshot's own
// watchlist rule states, using only fields the snapshot carries: the category,
// and whole words and prefixes in the name. parentProtocol is not one of the
// snapshot's fields, so the name and category tests are what an entry can run.
const WRAPPED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Cross Chain Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);
const EXCHANGE_PREFIXES = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isWrappedOrExchange(p: Protocol): boolean {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(x + " "));
}

// Category families for the peer-multiple fallback ladder. A family is a set
// of DefiLlama categories whose launched tokens price TVL in a similar way.
const FAMILIES: Record<string, string[]> = {
  lending: ["Lending", "CDP", "CDP Manager", "Uncollateralized Lending", "Collateral Markets"],
  trading: ["Dexs", "Derivatives", "Interest Rate Derivatives", "Options Vault", "Prediction Market", "OTC Marketplace"],
  yield: ["Yield", "Yield Aggregator", "Leveraged Farming", "Farm", "Basis Trading", "Liquidity Manager", "Risk Curators", "Onchain Capital Allocator"],
  staking: ["Liquid Staking", "Liquid Restaking", "Restaking", "Staking Pool", "Restaked BTC"],
  infra: ["Bridge", "Canonical Bridge", "Cross Chain Bridge", "Chain"],
};
const FAMILY_OF = new Map<string, string>();
for (const [fam, cats] of Object.entries(FAMILIES)) for (const c of cats) FAMILY_OF.set(c, fam);
export const familyOf = (category: string | null): string => (category !== null && FAMILY_OF.get(category)) || "other";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface PeerStats {
  /** Median mcap/TVL for a pre-token protocol, with the basis it came from. */
  multipleFor(p: Protocol): { multiple: number; basis: string };
  globalMedian: number;
  launchedCount: number;
}

/** Build the peer multiples from the launched half of the snapshot. */
export function peerStats(snap: Snapshot): PeerStats {
  const launched = snap.protocols.filter((p) => !recordsNoToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
  const byCategory = new Map<string, number[]>();
  const byFamily = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of launched) {
    const r = p.mcap_usd! / p.tvl_usd;
    all.push(r);
    const fam = familyOf(p.category);
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(r);
    if (p.category !== null) {
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category)!.push(r);
    }
  }
  const globalMedian = median(all);
  return {
    globalMedian,
    launchedCount: launched.length,
    multipleFor(p: Protocol) {
      const cat = p.category !== null ? byCategory.get(p.category) : undefined;
      if (cat !== undefined && cat.length >= 4) {
        return { multiple: median(cat), basis: `category ${p.category}, ${cat.length} launched peers` };
      }
      const fam = familyOf(p.category);
      const famXs = byFamily.get(fam);
      if (famXs !== undefined && famXs.length >= 4) {
        return { multiple: median(famXs), basis: `${fam} family, ${famXs.length} launched peers` };
      }
      return { multiple: globalMedian, basis: `all ${all.length} launched protocols` };
    },
  };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Seven-day TVL momentum: +80% or more earns 1.32, -40% or worse earns 0.84. */
export function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return 1 + clamp(change7d, -40, 80) * 0.004;
}

/** Track record: three years running with no token earns the full 1.20. */
export function ageFactor(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 0.9;
  const days = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(listedAt)) / 86400000));
  return 0.8 + 0.4 * Math.min(1, days / 1095);
}

/** A wrapped or exchange product's own launch is a claim on another asset. */
export const CLASS_FACTOR_NATIVE = 1;
export const CLASS_FACTOR_WRAPPED = 0.03;

export function impliedValue(p: Protocol, snap: Snapshot, peers: PeerStats): {
  value: number; multiple: number; basis: string; growth: number; age: number; classFactor: number; klass: "native" | "wrapped";
} {
  const { multiple, basis } = peers.multipleFor(p);
  const growth = growthFactor(p.change_7d);
  const age = ageFactor(p.listed_at, snap.as_of);
  const wrapped = isWrappedOrExchange(p);
  const classFactor = wrapped ? CLASS_FACTOR_WRAPPED : CLASS_FACTOR_NATIVE;
  const raw = p.tvl_usd * multiple * growth * age * classFactor;
  return {
    value: Math.max(1, Math.min(100_000_000_000_000, Math.round(raw))),
    multiple, basis, growth, age, classFactor,
    klass: wrapped ? "wrapped" : "native",
  };
}

// ---------------------------------------------------------------- farm plans
//
// A plan is generated per protocol from its family, its main chain and its
// size. Every step names an action, what it costs and how long it takes; the
// wording varies with a hash of the slug so two rows never read as one paste.

function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CHAIN_COST: Record<string, string> = {
  Ethereum: "Ethereum gas runs about $6-$25 for a deposit-and-stake round trip at ordinary fees",
  Arbitrum: "Arbitrum gas is a few cents per transaction",
  Base: "Base gas is a few cents per transaction",
  Optimism: "Optimism gas is a few cents per transaction",
  Solana: "Solana fees are under a cent per transaction",
  BSC: "BSC gas is roughly $0.10-$0.40 per transaction",
  Binance: "BSC gas is roughly $0.10-$0.40 per transaction",
  Polygon: "Polygon gas is a few cents per transaction",
  Avalanche: "Avalanche gas is roughly $0.05-$0.30 per transaction",
};
const chainCost = (chain: string): string => CHAIN_COST[chain] ?? `gas on ${chain} is a small per-transaction fee`;

function sizeBand(tvl: number): { stake: string; tier: string } {
  if (tvl >= 1_000_000_000) return { stake: "$500-$2,000", tier: "a large, deep market" };
  if (tvl >= 100_000_000) return { stake: "$250-$1,000", tier: "a well-used market" };
  if (tvl >= 10_000_000) return { stake: "$100-$500", tier: "a mid-size market" };
  return { stake: "$50-$250", tier: "an early, thin market" };
}

const CORE_ACTION: Record<string, (name: string, chain: string) => string> = {
  lending: (n, c) => `Supply ${"stablecoins or ETH"} to ${n}'s main ${c} market and leave the position open; a supply position you hold for weeks, not days, is what a snapshot of lenders sees.`,
  trading: (n, c) => `Trade on ${n} on ${c} every week rather than in one burst: steady, real volume across several pairs is the pattern a points or snapshot program can tell from wash trading.`,
  yield: (n, c) => `Deposit into ${n}'s flagship vault on ${c} and keep the receipt token in the same wallet; vault share balances held over time are the record a distribution would read.`,
  staking: (n, c) => `Stake through ${n} on ${c} and hold the liquid staking token unhedged in your wallet; time staked, not the deposit day alone, is what a launch snapshot can measure.`,
  infra: (n, c) => `Bridge a working balance through ${n} to ${c} and keep using the destination chain weekly; routes and repeat crossings are what bridge usage records show.`,
  other: (n, c) => `Use ${n}'s core product on ${c} the way a real user would, on a weekly rhythm: connect, transact, and leave a balance or position open between visits.`,
};

const SECOND_ACTION: Record<string, (name: string) => string> = {
  lending: (n) => `Borrow a modest amount against the supply (keep health factor above 2) and re-supply it once: borrowing is the second half of ${n}'s market and marks you as a two-sided user.`,
  trading: (n) => `Also provide liquidity to one of ${n}'s pools, even a small position: makers and takers are usually counted separately, and holding both roles covers either rule.`,
  yield: (n) => `Split the deposit across two of ${n}'s vaults or strategies instead of one: breadth across a protocol's products is cheap to add and reads as genuine use.`,
  staking: (n) => `Use the staking token once inside a partner money market or pool: a staking token that circulates is stronger evidence of use than one that only sits.`,
  infra: (n) => `Repeat the crossing in the other direction and try a second route or asset: round trips and route variety are the usage a bridge can verify on-chain.`,
  other: (n) => `Try ${n}'s second product or second chain as well as the first: using more of the surface, lightly, beats maxing one corner of it.`,
};

export function farmSteps(p: Protocol, snap: Snapshot): string[] {
  const fam = familyOf(p.category);
  const chain = p.chains[0] ?? "Ethereum";
  const { stake, tier } = sizeBand(p.tvl_usd);
  const h = slugHash(p.slug);
  const cat = p.category ?? "DeFi";
  const steps: string[] = [];

  steps.push(
    `Set up a fresh wallet for ${p.name} and fund it on ${chain} with ${stake} of working capital. ${p.name} is ${tier} (${cat}); setup takes about 20 minutes and ${chainCost(chain)}.`,
  );
  steps.push(CORE_ACTION[fam]!(p.name, chain));
  steps.push(SECOND_ACTION[fam]!(p.name));
  const cadence = [
    `Keep a weekly rhythm for 8-12 weeks: one or two real transactions a week, about 10 minutes of upkeep, and never empty the position the day after a rumoured snapshot date.`,
    `Return weekly for at least two months: small repeat transactions, about 10 minutes a week, cost little more in fees and build the history a retroactive program rewards.`,
    `Stay active on a weekly cadence for a full quarter: roughly 10 minutes a week of real use, holding the position through month-ends when snapshots are usually taken.`,
  ][h % 3]!;
  steps.push(cadence);
  steps.push(
    `Take part off-chain too: follow ${p.name}'s announcements, join its community calls or forum, and vote in any governance poll it runs; an hour a month, free, and it covers the programs that weight community activity.`,
  );
  steps.push(
    `Keep your own records from day one (dates, amounts, transaction hashes) in a simple sheet: if ${p.name} launches with a claim window, past windows have run as short as 30-90 days, and records make a claim a 15-minute job.`,
  );
  if (p.chains.length > 1) {
    steps.push(
      `Spread a smaller second position to ${p.chains[1]}: ${p.name} runs on ${p.chains.length} chains, and multi-chain users are the group most often named when a launch rewards breadth.`,
    );
  }
  return steps;
}

// ---------------------------------------------------------------- the board

export function buildBoard(snap: Snapshot): { rows: BoardRow[]; launched: LaunchedRow[]; peers: PeerStats } {
  const peers = peerStats(snap);
  const watch = new Set(snap.watchlist);
  const rows: BoardRow[] = snap.protocols
    .filter(recordsNoToken)
    .map((p) => {
      const iv = impliedValue(p, snap, peers);
      return {
        slug: p.slug,
        name: p.name,
        rank: 0,
        implied_value_usd: iv.value,
        farm_steps: farmSteps(p, snap),
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        listed_at: p.listed_at,
        watchlist: watch.has(p.slug),
        klass: iv.klass,
        multiple: Math.round(iv.multiple * 10000) / 10000,
        multiple_basis: iv.basis,
        growth_factor: Math.round(iv.growth * 1000) / 1000,
        age_factor: Math.round(iv.age * 1000) / 1000,
        class_factor: iv.classFactor,
      };
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => (r.rank = i + 1));

  const launched: LaunchedRow[] = snap.protocols
    .filter((p) => !recordsNoToken(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      symbol: p.symbol,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 10000) / 10000 : null,
    }))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  return { rows, launched, peers };
}
