// ─── Enums ───────────────────────────────────────────────────────────────────

export type Game = 'pokemon' | 'onepiece' | 'mtg' | 'yugioh' | 'lorcana';

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export type CardVariant =
  | 'standard'
  | 'holo'
  | 'reverse_holo'
  | 'first_edition'
  | 'alt_art'
  | 'full_art'
  | 'promo'
  | 'graded';

export type PriceSource = 'ebay' | 'scryfall' | 'ygo_pro_deck' | 'pokemon_tcg_io' | 'manual';

export type SubscriptionTier = 'starter' | 'pro' | 'business' | 'enterprise';

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

export type UserRole = 'owner' | 'staff';

export type TransactionType = 'trade_in' | 'buylist' | 'retail_pricing';

export type TransactionStatus = 'open' | 'completed' | 'cancelled' | 'on_hold';

// ─── Store ────────────────────────────────────────────────────────────────────

export interface Store {
  id: string;
  name: string;
  owner_id: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  games_supported: Game[];
  default_margin_percent: number;
  created_at: string;
  updated_at: string;
}

export interface StoreUser {
  id: string;
  store_id: string;
  user_id: string;
  role: UserRole;
  invited_at: string;
  accepted_at: string | null;
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export interface Card {
  id: string;
  game: Game;
  name: string;
  set_name: string;
  set_code: string;
  card_number: string;
  rarity: string;
  card_type: string;
  image_url: string;
  variants: CardVariant[];
  language: string;
  created_at: string;
  updated_at: string;
}

export interface PriceCache {
  id: string;
  card_id: string;
  variant: CardVariant;
  condition: CardCondition;
  market_price: number;   // USD cents
  low_price: number;      // USD cents
  mid_price: number;      // USD cents
  high_price: number;     // USD cents
  sale_count: number;     // Number of recent sales used to compute price
  source: PriceSource;
  fetched_at: string;
  expires_at: string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  store_id: string;
  card_id: string;
  condition: CardCondition;
  variant: CardVariant;
  quantity: number;
  cost_basis: number;              // USD cents
  sell_price: number;              // USD cents
  market_price_cached: number;     // USD cents
  market_price_updated_at: string;
  low_stock_threshold: number;
  notes: string | null;
  added_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export interface ConditionModifier {
  condition: CardCondition;
  adjustment_percent: number;
}

export interface Rule {
  id: string;
  rule_set_id: string;
  priority: number;
  min_market_value: number | null;   // USD cents
  max_market_value: number | null;   // USD cents
  credit_percentage: number;
  cash_percentage: number | null;
  condition_modifiers: ConditionModifier[];
  game_filter: Game[] | null;
  excluded_rarities: string[] | null;
  created_at: string;
}

export interface RuleSet {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  rules: Rule[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  store_id: string;
  type: TransactionType;
  status: TransactionStatus;
  rule_set_id: string | null;
  customer_id: string | null;
  notes: string | null;
  total_credit_value: number;        // USD cents
  total_cash_value: number;          // USD cents
  offer_locked_until: string | null;
  created_by: string;
  completed_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  card_id: string;
  condition: CardCondition;
  variant: CardVariant;
  market_price_at_time: number;      // USD cents
  calculated_credit_value: number;   // USD cents
  calculated_cash_value: number;     // USD cents
  override_credit_value: number | null;
  override_cash_value: number | null;
  override_note: string | null;
  rule_applied_id: string | null;
  was_accepted: boolean;
  created_at: string;
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  store_credit_balance: number;      // USD cents
  created_at: string;
  updated_at: string;
}

export interface CustomerCreditLedger {
  id: string;
  customer_id: string;
  store_id: string;
  amount: number;                    // USD cents — positive=issued, negative=applied
  type: 'issued' | 'applied' | 'adjusted';
  transaction_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}
