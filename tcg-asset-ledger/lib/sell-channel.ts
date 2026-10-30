// Where-to-sell analysis (pure, no DB). For each card, compute net proceeds and
// profit per channel after fees + shipping, then recommend fast cash (online) vs
// holding for a show. "Balanced": sell online only when it keeps most of the
// show profit — otherwise the fees+shipping aren't worth the speed.

import { formatUSD } from "./money";

export interface Channel {
  key: string;
  label: string;
  feePct: number; // percent of sale price taken as fees (shows = 0)
  ships: boolean; // online channels pay shipping; shows are in-person
  fast: boolean; // online = fast cash (~2 weeks); shows = slower/best-net
}

export const DEFAULT_CHANNELS: Channel[] = [
  { key: "show", label: "Show", feePct: 0, ships: false, fast: false },
  { key: "tcgplayer", label: "TCGplayer", feePct: 12, ships: true, fast: true },
  { key: "whatnot", label: "Whatnot", feePct: 8, ships: true, fast: true },
];

export interface ShipConfig {
  thresholdCents: number; // above this sale price, use overCents
  overCents: number;
  underCents: number;
}
export const DEFAULT_SHIP: ShipConfig = { thresholdCents: 50_00, overCents: 6_00, underCents: 1_00 };

/** Balanced default: sell online only if it retains ≥ this share of the show profit. */
export const RETENTION_THRESHOLD = 0.6;

export function shippingFor(marketCents: number, ships: boolean, ship: ShipConfig): number {
  if (!ships) return 0;
  return marketCents > ship.thresholdCents ? ship.overCents : ship.underCents;
}

export interface ChannelResult {
  key: string;
  label: string;
  feeCents: number;
  shippingCents: number;
  netCents: number;
  profitCents: number;
  fast: boolean;
}

export type SellAction = "sell" | "hold";

export interface CardAnalysis {
  basisCents: number;
  marketCents: number;
  perChannel: ChannelResult[];
  showNetCents: number;
  showProfitCents: number;
  bestOnline: ChannelResult | null;
  recommendation: { channelKey: string; action: SellAction; reason: string };
}

export interface AnalyzeConfig {
  channels?: Channel[];
  ship?: ShipConfig;
  retentionThreshold?: number;
}

export function analyzeCard(basisCents: number, marketCents: number, cfg: AnalyzeConfig = {}): CardAnalysis {
  const channels = cfg.channels ?? DEFAULT_CHANNELS;
  const ship = cfg.ship ?? DEFAULT_SHIP;
  const retention = cfg.retentionThreshold ?? RETENTION_THRESHOLD;

  const perChannel: ChannelResult[] = channels.map((c) => {
    const feeCents = Math.round((marketCents * c.feePct) / 100);
    const shippingCents = shippingFor(marketCents, c.ships, ship);
    const netCents = marketCents - feeCents - shippingCents;
    return { key: c.key, label: c.label, feeCents, shippingCents, netCents, profitCents: netCents - basisCents, fast: c.fast };
  });

  const show = perChannel.find((c) => c.key === "show");
  const showNetCents = show ? show.netCents : marketCents;
  const showProfitCents = showNetCents - basisCents;

  const online = perChannel.filter((c) => c.fast);
  const bestOnline = online.length ? online.reduce((a, b) => (b.netCents > a.netCents ? b : a)) : null;

  let recommendation: CardAnalysis["recommendation"];
  if (!bestOnline) {
    recommendation = { channelKey: show?.key ?? "show", action: "hold", reason: "No online channel selected — sell at a show." };
  } else if (showProfitCents <= 0) {
    recommendation = {
      channelKey: "show",
      action: "hold",
      reason: `Underwater at ${formatUSD(marketCents)} — a show keeps the most (online fees+shipping would lose even more).`,
    };
  } else {
    const onlineProfit = bestOnline.profitCents;
    const retentionRatio = onlineProfit / showProfitCents;
    const pct = Math.round(retentionRatio * 100);
    if (onlineProfit > 0 && retentionRatio >= retention) {
      recommendation = {
        channelKey: bestOnline.key,
        action: "sell",
        reason: `Nets ${formatUSD(bestOnline.netCents)} on ${bestOnline.label} (${pct}% of the show profit) — worth it for cash in ~2 weeks.`,
      };
    } else {
      recommendation = {
        channelKey: "show",
        action: "hold",
        reason: `After fees+shipping, online leaves only ${formatUSD(Math.max(0, onlineProfit))} (${pct}% of the show profit) — hold for a show.`,
      };
    }
  }

  return { basisCents, marketCents, perChannel, showNetCents, showProfitCents, bestOnline, recommendation };
}

export interface LiquidationCard {
  id: string;
  name: string;
  basisCents: number;
  marketCents: number;
}

export interface LiquidationPick extends LiquidationCard {
  channelKey: string;
  channelLabel: string;
  onlineNetCents: number;
  onlineProfitCents: number;
  sacrificeCents: number; // profit given up vs holding for a show
}

export interface LiquidationPlan {
  picks: LiquidationPick[];
  raisedCents: number;
  sacrificedCents: number;
  targetCents: number;
  targetMet: boolean;
}

/**
 * Pick which cards to sell online to raise ~targetCents in fast cash, choosing
 * the cards that give up the LEAST profit per dollar raised (most liquidation-
 * efficient first). Only cards with positive online net are eligible.
 */
export function planLiquidation(cards: LiquidationCard[], targetCents: number, cfg: AnalyzeConfig = {}): LiquidationPlan {
  const eligible = cards
    .map((card) => ({ card, a: analyzeCard(card.basisCents, card.marketCents, cfg) }))
    .filter((x) => x.a.bestOnline && x.a.bestOnline.netCents > 0)
    .map((x) => {
      const best = x.a.bestOnline!;
      const sacrifice = Math.max(0, x.a.showProfitCents - best.profitCents);
      return {
        ...x.card,
        channelKey: best.key,
        channelLabel: best.label,
        onlineNetCents: best.netCents,
        onlineProfitCents: best.profitCents,
        sacrificeCents: sacrifice,
        eff: sacrifice / best.netCents, // profit lost per dollar raised
      };
    })
    .sort((p, q) => p.eff - q.eff || q.onlineNetCents - p.onlineNetCents);

  const picks: LiquidationPick[] = [];
  let raisedCents = 0;
  let sacrificedCents = 0;
  for (const e of eligible) {
    if (raisedCents >= targetCents) break;
    const { eff: _eff, ...pick } = e;
    picks.push(pick);
    raisedCents += e.onlineNetCents;
    sacrificedCents += e.sacrificeCents;
  }
  return { picks, raisedCents, sacrificedCents, targetCents, targetMet: raisedCents >= targetCents };
}
