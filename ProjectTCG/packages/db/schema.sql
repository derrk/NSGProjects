-- ProjectTCG Database Schema
-- All monetary values stored as INTEGER (USD cents)
-- Multi-tenancy enforced via Row-Level Security (RLS)

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE game AS ENUM ('pokemon', 'onepiece', 'mtg', 'yugioh', 'lorcana');
CREATE TYPE card_condition AS ENUM ('NM', 'LP', 'MP', 'HP', 'DMG');
CREATE TYPE card_variant AS ENUM ('standard', 'holo', 'reverse_holo', 'first_edition', 'alt_art', 'full_art', 'promo', 'graded');
CREATE TYPE price_source AS ENUM ('ebay', 'scryfall', 'ygo_pro_deck', 'pokemon_tcg_io', 'manual');
CREATE TYPE subscription_tier AS ENUM ('starter', 'pro', 'business', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');
CREATE TYPE user_role AS ENUM ('owner', 'staff');
CREATE TYPE transaction_type AS ENUM ('trade_in', 'buylist', 'retail_pricing');
CREATE TYPE transaction_status AS ENUM ('open', 'completed', 'cancelled', 'on_hold');
CREATE TYPE credit_ledger_type AS ENUM ('issued', 'applied', 'adjusted');

-- ─── Stores ───────────────────────────────────────────────────────────────────

CREATE TABLE stores (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  owner_id              UUID NOT NULL REFERENCES auth.users(id),
  subscription_tier     subscription_tier NOT NULL DEFAULT 'starter',
  subscription_status   subscription_status NOT NULL DEFAULT 'trialing',
  games_supported       game[] NOT NULL DEFAULT ARRAY['pokemon']::game[],
  default_margin_percent INTEGER NOT NULL DEFAULT 40,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  role        user_role NOT NULL DEFAULT 'staff',
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(store_id, user_id)
);

-- Helper function: get the store_id for the currently authenticated user
CREATE OR REPLACE FUNCTION get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM store_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── Cards (shared, not tenant-specific) ─────────────────────────────────────

CREATE TABLE cards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game        game NOT NULL,
  name        TEXT NOT NULL,
  set_name    TEXT NOT NULL,
  set_code    TEXT NOT NULL,
  card_number TEXT NOT NULL,
  rarity      TEXT NOT NULL DEFAULT '',
  card_type   TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  variants    card_variant[] NOT NULL DEFAULT ARRAY['standard']::card_variant[],
  language    TEXT NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game, set_code, card_number, language)
);

CREATE INDEX idx_cards_game ON cards(game);
CREATE INDEX idx_cards_set_code ON cards(set_code);
CREATE INDEX idx_cards_name ON cards USING gin(to_tsvector('english', name));

-- ─── Price Cache ──────────────────────────────────────────────────────────────

CREATE TABLE price_cache (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id      UUID NOT NULL REFERENCES cards(id),
  variant      card_variant NOT NULL DEFAULT 'standard',
  condition    card_condition NOT NULL DEFAULT 'NM',
  market_price INTEGER NOT NULL DEFAULT 0,
  low_price    INTEGER NOT NULL DEFAULT 0,
  mid_price    INTEGER NOT NULL DEFAULT 0,
  high_price   INTEGER NOT NULL DEFAULT 0,
  sale_count   INTEGER NOT NULL DEFAULT 0,
  source       price_source NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  UNIQUE(card_id, variant, condition, source)
);

CREATE INDEX idx_price_cache_card_id ON price_cache(card_id);
CREATE INDEX idx_price_cache_expires_at ON price_cache(expires_at);

-- ─── Inventory ────────────────────────────────────────────────────────────────

CREATE TABLE inventory_items (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id                 UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  card_id                  UUID NOT NULL REFERENCES cards(id),
  condition                card_condition NOT NULL DEFAULT 'NM',
  variant                  card_variant NOT NULL DEFAULT 'standard',
  quantity                 INTEGER NOT NULL DEFAULT 1,
  cost_basis               INTEGER NOT NULL DEFAULT 0,
  sell_price               INTEGER NOT NULL DEFAULT 0,
  market_price_cached      INTEGER NOT NULL DEFAULT 0,
  market_price_updated_at  TIMESTAMPTZ,
  low_stock_threshold      INTEGER NOT NULL DEFAULT 1,
  notes                    TEXT,
  added_by                 UUID REFERENCES auth.users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_store_id ON inventory_items(store_id);
CREATE INDEX idx_inventory_card_id ON inventory_items(card_id);

-- ─── Rule Sets ────────────────────────────────────────────────────────────────

CREATE TABLE rule_sets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rules (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_set_id          UUID NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
  priority             INTEGER NOT NULL DEFAULT 0,
  min_market_value     INTEGER,
  max_market_value     INTEGER,
  credit_percentage    INTEGER NOT NULL,
  cash_percentage      INTEGER,
  condition_modifiers  JSONB NOT NULL DEFAULT '[]',
  game_filter          game[],
  excluded_rarities    TEXT[],
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_rule_set_id ON rules(rule_set_id);

-- ─── Customers ────────────────────────────────────────────────────────────────

CREATE TABLE customers (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id             UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  phone                TEXT,
  email                TEXT,
  notes                TEXT,
  store_credit_balance INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_store_id ON customers(store_id);

CREATE TABLE customer_credit_ledger (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id       UUID NOT NULL REFERENCES stores(id),
  amount         INTEGER NOT NULL,
  type           credit_ledger_type NOT NULL,
  transaction_id UUID,
  note           TEXT,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Transactions ─────────────────────────────────────────────────────────────

CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type                transaction_type NOT NULL,
  status              transaction_status NOT NULL DEFAULT 'open',
  rule_set_id         UUID REFERENCES rule_sets(id),
  customer_id         UUID REFERENCES customers(id),
  notes               TEXT,
  total_credit_value  INTEGER NOT NULL DEFAULT 0,
  total_cash_value    INTEGER NOT NULL DEFAULT 0,
  offer_locked_until  TIMESTAMPTZ,
  created_by          UUID REFERENCES auth.users(id),
  completed_by        UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_transactions_store_id ON transactions(store_id);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);

CREATE TABLE transaction_items (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id          UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  card_id                 UUID NOT NULL REFERENCES cards(id),
  condition               card_condition NOT NULL,
  variant                 card_variant NOT NULL DEFAULT 'standard',
  market_price_at_time    INTEGER NOT NULL DEFAULT 0,
  calculated_credit_value INTEGER NOT NULL DEFAULT 0,
  calculated_cash_value   INTEGER NOT NULL DEFAULT 0,
  override_credit_value   INTEGER,
  override_cash_value     INTEGER,
  override_note           TEXT,
  rule_applied_id         UUID REFERENCES rules(id),
  was_accepted            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_items_transaction_id ON transaction_items(transaction_id);

-- ─── Audit Log ────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id),
  user_id     UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  changes     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_store_id ON audit_log(store_id);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Cards and price_cache are read-only for all authenticated users (shared data)
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cards_read_all" ON cards FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "price_cache_read_all" ON price_cache FOR SELECT USING (auth.uid() IS NOT NULL);

-- Store isolation: users only see their own store's data
CREATE POLICY "store_isolation" ON inventory_items
  USING (store_id = get_user_store_id());

CREATE POLICY "store_isolation" ON rule_sets
  USING (store_id = get_user_store_id());

CREATE POLICY "store_isolation" ON rules
  USING (rule_set_id IN (SELECT id FROM rule_sets WHERE store_id = get_user_store_id()));

CREATE POLICY "store_isolation" ON customers
  USING (store_id = get_user_store_id());

CREATE POLICY "store_isolation" ON customer_credit_ledger
  USING (store_id = get_user_store_id());

CREATE POLICY "store_isolation" ON transactions
  USING (store_id = get_user_store_id());

CREATE POLICY "store_isolation" ON transaction_items
  USING (transaction_id IN (SELECT id FROM transactions WHERE store_id = get_user_store_id()));

CREATE POLICY "store_isolation" ON audit_log
  USING (store_id = get_user_store_id());
