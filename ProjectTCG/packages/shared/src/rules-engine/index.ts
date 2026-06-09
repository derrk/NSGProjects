import type { Card, CardCondition, Rule, RuleSet } from '../types';

export interface RuleEvaluationResult {
  eligible: boolean;
  creditValue: number;      // USD cents
  cashValue: number;        // USD cents
  ruleApplied: Rule | null;
  reasoning: string;
}

export function evaluateCard(
  card: Card,
  condition: CardCondition,
  marketPrice: number,      // USD cents
  ruleSet: RuleSet,
): RuleEvaluationResult {
  const sorted = [...ruleSet.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (!matchesRule(card, condition, marketPrice, rule)) continue;
    return applyRule(marketPrice, condition, rule);
  }

  return {
    eligible: false,
    creditValue: 0,
    cashValue: 0,
    ruleApplied: null,
    reasoning: 'No matching rule found for this card.',
  };
}

function matchesRule(
  card: Card,
  _condition: CardCondition,
  marketPrice: number,
  rule: Rule,
): boolean {
  if (rule.min_market_value !== null && marketPrice < rule.min_market_value) return false;
  if (rule.max_market_value !== null && marketPrice > rule.max_market_value) return false;
  if (rule.game_filter !== null && !rule.game_filter.includes(card.game)) return false;
  if (rule.excluded_rarities !== null && rule.excluded_rarities.includes(card.rarity)) return false;
  return true;
}

function applyRule(
  marketPrice: number,
  condition: CardCondition,
  rule: Rule,
): RuleEvaluationResult {
  const conditionMod = rule.condition_modifiers.find((m) => m.condition === condition);
  const conditionFactor = conditionMod ? 1 + conditionMod.adjustment_percent / 100 : 1;

  const creditValue = Math.floor(
    (marketPrice * rule.credit_percentage) / 100 * conditionFactor,
  );
  const cashValue = rule.cash_percentage !== null
    ? Math.floor((marketPrice * rule.cash_percentage) / 100 * conditionFactor)
    : 0;

  return {
    eligible: true,
    creditValue,
    cashValue,
    ruleApplied: rule,
    reasoning: `Rule matched: ${rule.credit_percentage}% credit${rule.cash_percentage ? ` / ${rule.cash_percentage}% cash` : ''}${conditionMod ? ` with ${conditionMod.adjustment_percent}% condition modifier` : ''}`,
  };
}

export function evaluateSession(
  cards: Array<{ card: Card; condition: CardCondition; marketPrice: number }>,
  ruleSet: RuleSet,
): { results: RuleEvaluationResult[]; totalCredit: number; totalCash: number } {
  const results = cards.map(({ card, condition, marketPrice }) =>
    evaluateCard(card, condition, marketPrice, ruleSet),
  );

  const accepted = results.filter((r) => r.eligible);
  const totalCredit = accepted.reduce((sum, r) => sum + r.creditValue, 0);
  const totalCash = accepted.reduce((sum, r) => sum + r.cashValue, 0);

  return { results, totalCredit, totalCash };
}
