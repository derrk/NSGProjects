# Technical Architecture — ProjectTCG

**Version:** 0.1
**Last Updated:** May 2026
**Status:** Approved — implementation ready

---

## Table of Contents

1. [Stack Overview](#1-stack-overview)
2. [Repository Structure](#2-repository-structure)
3. [Mobile App Architecture](#3-mobile-app-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Card Scanning Pipeline](#5-card-scanning-pipeline)
6. [Offline Sync Strategy](#6-offline-sync-strategy)
7. [Multi-Tenancy](#7-multi-tenancy)
8. [Data Models](#8-data-models)
9. [Rules Engine](#9-rules-engine)
10. [Pricing API Integration](#10-pricing-api-integration)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Payments & Subscriptions](#12-payments--subscriptions)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Third-Party Dependencies](#14-third-party-dependencies)
15. [Development Setup](#15-development-setup)

---

## 1. Stack Overview

| Layer | Technology | Reason |
|---|---|---|
| Mobile | React Native (Expo) | iOS + Android from one TypeScript codebase; shares code with web (Phase 2) |
| Web (Phase 2) | Next.js | Same TypeScript ecosystem; shares packages with mobile |
| Database | PostgreSQL via Supabase | Industry-standard SaaS database; row-level security for multi-tenancy |
| Auth | Supabase Auth | Built-in; supports email/password, Apple Sign-In, Google |
| Storage | Supabase Storage | Card images, exports, attachments |
| Backend Logic | Supabase Edge Functions | Serverless TypeScript functions for pricing API calls and rules engine |
| Real-time | Supabase Realtime | Live inventory sync across devices on the same store account |
| Pricing | eBay Browse API + Scryfall + YGOPRODeck | TCGPlayer API closed to new developers; eBay sold listings are real transaction data |
| Local DB (offline) | WatermelonDB (SQLite) | Purpose-built for React Native offline-first; syncs with Supabase |
| Mobile Subscriptions | RevenueCat | Handles iOS App Store and Google Play billing complexity |
| Web Subscriptions | Stripe | Used for web billing in Phase 2 |
| Monorepo | Turborepo | Manages mobile, web, and shared packages in one repository |
| Language | TypeScript (throughout) | One language across all layers; shared types eliminate bugs |
| Camera / Scanning | react-native-vision-camera | Best-in-class React Native camera library |
| OCR | Google ML Kit (on-device) | Free, offline-capable, fast — reads card set numbers |

---

## 2. Repository Structure

The entire project lives in a single monorepo. Shared code (types, utilities, business logic) is written once and imported by both mobile and web.

```
ProjectTCG/
├── apps/
│   ├── mobile/                  # React Native (Expo) — iOS & Android
│   │   ├── app/                 # Expo Router file-based routes
│   │   │   ├── (auth)/          # Login, signup screens
│   │   │   ├── (tabs)/          # Main tab navigation
│   │   │   │   ├── inventory/   # Inventory screens
│   │   │   │   ├── scan/        # Scanning screens
│   │   │   │   ├── transactions/# Transaction mode screens
│   │   │   │   └── customers/   # Customer record screens
│   │   │   └── settings/        # Settings screens
│   │   ├── components/          # Reusable UI components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── db/                  # WatermelonDB local schema and models
│   │   └── sync/                # Offline sync logic
│   │
│   └── web/                     # Next.js web dashboard (Phase 2)
│       ├── app/                 # Next.js App Router
│       ├── components/
│       └── ...
│
├── packages/
│   ├── shared/                  # Shared across mobile and web
│   │   ├── types/               # TypeScript interfaces for all entities
│   │   ├── rules-engine/        # Rules evaluation logic (pure TypeScript)
│   │   ├── validators/          # Shared input validation
│   │   └── utils/               # Shared utilities
│   │
│   └── db/                      # Database schema and migrations
│       ├── migrations/          # Supabase SQL migrations
│       ├── schema.sql           # Full schema definition
│       └── seed.sql             # Development seed data
│
├── supabase/
│   ├── functions/               # Edge Functions (serverless backend)
│   │   ├── fetch-price/         # Pull market price for a card
│   │   ├── sync-inventory/      # Sync endpoint for WatermelonDB
│   │   └── webhooks/            # RevenueCat and Stripe webhooks
│   └── config.toml
│
├── docs/                        # All product and technical documentation
├── .github/
│   └── workflows/               # CI/CD (lint, test, build checks)
├── turbo.json                   # Turborepo configuration
├── package.json                 # Root workspace configuration
└── README.md
```

---

## 3. Mobile App Architecture

### Framework
**React Native with Expo (SDK 52+)**

Expo is used for:
- Managed build pipeline (Expo EAS Build) — no need to manage Xcode or Android Studio for routine builds
- Over-the-air (OTA) updates — push JS bundle updates to users without App Store review for non-native changes
- Expo Router — file-based navigation that mirrors how Next.js works, keeping mental models consistent between mobile and web

### Navigation
Expo Router with a tab-based layout. The main tabs are:
- **Inventory** — browse, search, edit card catalog
- **Scan** — camera scanning entry point, mode selector
- **Transactions** — active and completed sessions
- **Customers** — customer records and credit balances
- **Settings** — rules, store profile, subscription

### State Management
- **WatermelonDB** manages all persistent data (inventory, transactions, customers) — this is the local source of truth
- **Zustand** manages ephemeral UI state (active scan session, selected mode, current rule set)
- **TanStack Query** manages API/pricing fetch state (market prices, card identification results)

### Local Database
WatermelonDB uses SQLite under the hood, which is bundled with every mobile device. All inventory, transaction, customer, and rule set data is stored locally. This enables full offline functionality. The sync layer (Section 6) handles pushing changes up to Supabase and pulling remote changes down.

### Camera and Scanning
See Section 5 for the full scanning pipeline.

---

## 4. Backend Architecture

### Supabase as the Backend Platform

Supabase provides the full backend infrastructure:

**PostgreSQL Database**
The relational database stores all data. Row-level security (RLS) policies enforce multi-tenant data isolation at the database level — a store can only ever read and write its own data, even if application code has a bug.

**Supabase Auth**
Handles user creation, login, session management, and OAuth flows (Apple, Google). Integrates directly with RLS policies — every database row can be secured to the authenticated user's store.

**Supabase Storage**
Used for:
- Card images (cached from game APIs to reduce API dependency)
- User-uploaded photos (graded card photos, etc. — Phase 2)
- Generated PDF exports (buylist offer sheets)

**Supabase Realtime**
When multiple staff members are logged in on the same store account, inventory changes made by one user propagate to others in real time via Supabase Realtime subscriptions.

**Supabase Edge Functions**
Serverless TypeScript functions deployed at the edge. Used for operations that should not run on the client device:
- `fetch-price` — calls TCGPlayer/Scryfall/YGOPRODeck APIs using server-side API keys (keys never sent to client)
- `sync-inventory` — WatermelonDB sync endpoint, handles pull/push logic
- `apply-rules` — server-side rules engine evaluation (backup to client-side, used for bulk operations)
- `webhooks/revenuecat` — handles subscription status updates from RevenueCat
- `webhooks/stripe` — handles subscription events from Stripe (Phase 2)

### Why Not a Custom Node.js API?
For early-stage development with a small team, Supabase eliminates the need to build and maintain authentication, real-time infrastructure, and database management from scratch. The time savings are significant. When the business reaches a scale where custom infrastructure makes sense economically, migrating off Supabase is straightforward — it's standard PostgreSQL underneath.

---

## 5. Card Scanning Pipeline

This is the most technically complex feature. The pipeline runs primarily on-device for speed and offline capability.

### Step-by-Step Flow

```
User opens camera
       │
       ▼
react-native-vision-camera
captures live frames
       │
       ▼
Frame processor (runs on device)
Google ML Kit OCR reads text
from the card in real time
       │
       ▼
Set number parser
extracts set code + card number
(regex patterns per game)
       │
       ▼
Local card database lookup
(WatermelonDB — works offline)
       │
       ├── Found ──────────────────────────────────────────────┐
       │                                                        ▼
       └── Not found                               Show card: name, set,
              │                                    image, cached price
              ▼                                               │
       Manual search fallback                   If online: fetch fresh
       (search by name/set/number)              price from pricing API
                                                              │
                                                              ▼
                                                User selects condition
                                                              │
                                                              ▼
                                                Add to inventory or
                                                active transaction session
```

### Set Number Parsing (Per Game)

Each TCG prints card identifiers differently. The OCR output is parsed by game-specific regex patterns:

| Game | Card number format | Example |
|---|---|---|
| Pokemon TCG | `{number}/{total}` on bottom right | `151/165` |
| One Piece TCG | `{set}-{number}` | `OP01-001` |
| Magic: The Gathering | `{number}/{total}` + set code | `143/287` |
| Yu-Gi-Oh! | `{set}-{region}{number}` | `LEDE-EN001` |

The parser attempts to extract the identifier, then queries the local card database. If multiple possible matches are found, the user is shown a disambiguation screen.

### Local Card Database

Card data (names, set info, card numbers, image URLs) is synced periodically from game APIs to the device and stored in WatermelonDB. This database is:
- **Read-only on device** — only updated via background sync, never edited by users
- **Shared across all users of the app** — not tenant-specific
- **Small enough to store locally** — TCG card databases are hundreds of MB at most

Update frequency: daily sync in the background when the app is open and connected. New sets are added as they are released.

### Identification Accuracy Strategy

- **Primary:** OCR on set number (fast, high accuracy on clean cards)
- **Fallback 1:** Manual search by card name or set
- **Fallback 2:** User corrects identification after seeing the confirmation screen

Image recognition (identifying cards by artwork) is intentionally excluded from Phase 1. It is significantly more complex to build accurately, adds cost, and the OCR approach already covers the 95%+ case.

---

## 6. Offline Sync Strategy

### Architecture

WatermelonDB maintains a local SQLite database on the device. Supabase is the remote source of truth. Sync runs bidirectionally:

- **Push:** Local changes (creates, updates, deletes) are pushed to Supabase
- **Pull:** Remote changes (from other devices on the same store account) are pulled to the local database

### Sync Triggers

- On app foreground (returning from background)
- On connectivity restored (after offline period)
- On explicit user action ("sync now" button)
- On a background interval (every 15 minutes while app is open and connected)

### Conflict Resolution

When two devices edit the same record while offline:
- **Last-write-wins** based on `updated_at` timestamp for most fields
- **Append-only** for transaction records and credit ledger entries — these are never mutated, only appended, so conflicts cannot occur
- Conflicts are logged to an audit table for Owner review

### Offline Capabilities

| Feature | Offline behavior |
|---|---|
| View inventory | ✅ Full access |
| Edit inventory | ✅ Queued locally, syncs when connected |
| Scan and identify cards | ✅ Uses local card database |
| Live market pricing | ❌ Not available — shows cached price with age indicator |
| Start and complete transactions | ✅ Full access, syncs when connected |
| Customer records | ✅ Full access |
| Rules engine | ✅ Runs locally |
| Reports and analytics | ✅ Based on local data (may be behind remote) |

### Sync Status Indicator

A persistent UI element in the app header shows:
- **Synced** — all local changes pushed, remote changes pulled
- **Syncing...** — sync in progress
- **Offline** — no connectivity detected
- **X changes pending** — queued changes waiting to sync

---

## 7. Multi-Tenancy

### Model

Each store is a **tenant**. All data in the database is scoped to a `store_id`. Supabase Row-Level Security (RLS) policies enforce this at the database level.

### RLS Policy Pattern

Every table that contains store data includes a `store_id` column. RLS policies enforce:

```sql
-- Users can only read/write rows belonging to their store
CREATE POLICY "store_isolation" ON inventory_items
  USING (store_id = get_user_store_id());
```

`get_user_store_id()` is a Postgres function that reads the authenticated user's store membership from the `store_users` table. This means even if application code has a bug, the database will never return another store's data.

### Subscription Enforcement

Tier limits (inventory count, user count, number of rule sets) are enforced at two levels:
1. **Client-side:** UI prevents actions that would exceed tier limits, with an upgrade prompt
2. **Server-side:** Edge Functions and database triggers enforce limits as a hard backstop

---

## 8. Data Models

All entities are defined as TypeScript interfaces in `packages/shared/types/` and as SQL tables in `packages/db/schema.sql`.

---

### Store
The top-level tenant entity. One per shop/business.

```typescript
interface Store {
  id: string;                  // UUID
  name: string;
  owner_id: string;            // References auth.users
  subscription_tier: 'starter' | 'pro' | 'business' | 'enterprise';
  subscription_status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  games_supported: Game[];     // Games the store carries
  default_margin_percent: number; // Default for Retail Pricing mode
  created_at: string;
  updated_at: string;
}
```

---

### StoreUser
Links a user account to a store with a role. A user can belong to multiple stores.

```typescript
interface StoreUser {
  id: string;
  store_id: string;
  user_id: string;
  role: 'owner' | 'staff';
  invited_at: string;
  accepted_at: string | null;
}
```

---

### Card
The canonical card record. Shared across all tenants — not store-specific. Populated from game APIs.

```typescript
interface Card {
  id: string;
  game: Game;                  // 'pokemon' | 'onepiece' | 'mtg' | 'yugioh'
  name: string;
  set_name: string;
  set_code: string;
  card_number: string;         // e.g. "151/165" or "OP01-001"
  rarity: string;
  card_type: string;           // e.g. "Pokemon", "Trainer", "Land", "Monster"
  image_url: string;
  variants: CardVariant[];     // holo, reverse holo, alt art, etc.
  language: string;            // 'en' | 'jp' | etc.
  created_at: string;
  updated_at: string;
}

type Game = 'pokemon' | 'onepiece' | 'mtg' | 'yugioh' | 'lorcana';

type CardVariant =
  | 'standard'
  | 'holo'
  | 'reverse_holo'
  | 'first_edition'
  | 'alt_art'
  | 'full_art'
  | 'promo'
  | 'graded';
```

---

### PriceCache
Cached market prices per card and condition. Refreshed on a schedule and on-demand.

```typescript
interface PriceCache {
  id: string;
  card_id: string;
  variant: CardVariant;
  condition: CardCondition;
  market_price: number;        // In USD cents (integer to avoid float math)
  low_price: number;
  mid_price: number;
  high_price: number;
  source: PriceSource;         // 'tcgplayer' | 'scryfall' | 'cardtrader'
  fetched_at: string;
  expires_at: string;
}

type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
// Near Mint | Lightly Played | Moderately Played | Heavily Played | Damaged
```

---

### InventoryItem
A specific card in a store's inventory. One record per unique card + condition + variant combination.

```typescript
interface InventoryItem {
  id: string;
  store_id: string;
  card_id: string;
  condition: CardCondition;
  variant: CardVariant;
  quantity: number;
  cost_basis: number;          // USD cents — what the store paid
  sell_price: number;          // USD cents — what the store is selling for
  market_price_cached: number; // USD cents — last known market price
  market_price_updated_at: string;
  low_stock_threshold: number; // Default: 1
  notes: string | null;
  added_by: string;            // user_id
  created_at: string;
  updated_at: string;
}
```

---

### RuleSet
A named collection of rules used in transaction modes.

```typescript
interface RuleSet {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string;          // user_id
  created_at: string;
  updated_at: string;
}
```

---

### Rule
An individual rule within a rule set. Rules are evaluated in priority order — the first match wins.

```typescript
interface Rule {
  id: string;
  rule_set_id: string;
  priority: number;            // Lower number = evaluated first
  min_market_value: number | null;   // USD cents — null = no minimum
  max_market_value: number | null;   // USD cents — null = no maximum
  credit_percentage: number;         // e.g. 80 = 80% of market value
  cash_percentage: number | null;    // null = cash offer not available
  condition_modifiers: ConditionModifier[];
  game_filter: Game[] | null;        // null = applies to all games
  excluded_rarities: string[] | null;
  created_at: string;
}

interface ConditionModifier {
  condition: CardCondition;
  adjustment_percent: number;  // e.g. -10 = reduce offer by 10% for this condition
}
```

---

### Transaction
A trade-in, buylist, or retail pricing session.

```typescript
interface Transaction {
  id: string;
  store_id: string;
  type: 'trade_in' | 'buylist' | 'retail_pricing';
  status: 'open' | 'completed' | 'cancelled' | 'on_hold';
  rule_set_id: string | null;          // Used for trade_in and buylist
  customer_id: string | null;
  notes: string | null;
  total_credit_value: number;          // USD cents
  total_cash_value: number;            // USD cents
  offer_locked_until: string | null;   // For buylist offer expiry
  created_by: string;                  // user_id
  completed_by: string | null;
  created_at: string;
  completed_at: string | null;
}
```

---

### TransactionItem
An individual card within a transaction session.

```typescript
interface TransactionItem {
  id: string;
  transaction_id: string;
  card_id: string;
  condition: CardCondition;
  variant: CardVariant;
  market_price_at_time: number;        // USD cents — price when scanned
  calculated_credit_value: number;     // USD cents — from rules engine
  calculated_cash_value: number;       // USD cents — from rules engine
  override_credit_value: number | null; // Manual override
  override_cash_value: number | null;
  override_note: string | null;
  rule_applied_id: string | null;      // Which rule triggered
  was_accepted: boolean;               // Did the store accept this card?
  created_at: string;
}
```

---

### Customer

```typescript
interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  store_credit_balance: number;  // USD cents — computed from ledger
  created_at: string;
  updated_at: string;
}
```

---

### CustomerCreditLedger
Append-only log of every credit balance change. The `store_credit_balance` on Customer is derived from this.

```typescript
interface CustomerCreditLedger {
  id: string;
  customer_id: string;
  store_id: string;
  amount: number;              // USD cents — positive = issued, negative = applied
  type: 'issued' | 'applied' | 'adjusted';
  transaction_id: string | null;
  note: string | null;
  created_by: string;          // user_id
  created_at: string;
}
```

---

### AuditLog
Immutable record of all significant actions taken by any user in the store.

```typescript
interface AuditLog {
  id: string;
  store_id: string;
  user_id: string;
  action_type: string;         // e.g. 'inventory.update', 'transaction.complete'
  entity_type: string;         // e.g. 'inventory_item', 'customer'
  entity_id: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  created_at: string;
}
```

---

## 9. Rules Engine

The rules engine is implemented as a pure TypeScript module in `packages/shared/rules-engine/`. It has no dependencies on React Native or Supabase — it takes inputs and returns outputs. This means it runs identically on the device (during a scan session) and in a Supabase Edge Function (for server-side bulk operations).

### Evaluation Logic

```typescript
function evaluateCard(
  card: Card,
  condition: CardCondition,
  marketPrice: number,       // USD cents
  ruleSet: RuleSet,
  rules: Rule[]
): RuleEvaluationResult {

  // Sort rules by priority (ascending)
  const sortedRules = rules.sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (matchesRule(card, condition, marketPrice, rule)) {
      return applyRule(marketPrice, condition, rule);
    }
  }

  // No rule matched — card is not eligible under this rule set
  return { eligible: false, creditValue: 0, cashValue: 0, ruleApplied: null };
}
```

### Rule Matching

A card matches a rule when ALL of the following are true:
- Market price is within `min_market_value` and `max_market_value` (if set)
- Card's game is in `game_filter` (if set)
- Card's rarity is not in `excluded_rarities` (if set)

### Offer Calculation

```
credit_value = market_price × (credit_percentage / 100)
             × condition_modifier (if applicable)

cash_value   = market_price × (cash_percentage / 100)
             × condition_modifier (if applicable)
```

All calculations use integer arithmetic (USD cents) to avoid floating-point rounding errors.

---

## 10. Pricing API Integration

### Context: TCGPlayer API

TCGPlayer was the original planned primary pricing source. Following eBay's acquisition of TCGPlayer in 2022, their developer API program has been closed to new applicants. As a result, the pricing architecture uses eBay's sold listings API as the primary source — which reflects real completed transactions rather than asking prices, and is arguably more accurate market data.

### Architecture

Pricing API calls are made exclusively from Supabase Edge Functions, never from the client device. This keeps API keys server-side and allows rate limiting and caching at the server level.

The client requests a price by calling the `fetch-price` Edge Function with a `card_id` and `condition`. The function:
1. Checks `PriceCache` — if a non-expired price exists, returns it immediately
2. If expired or missing, calls the appropriate pricing source for that card's game
3. Stores the result in `PriceCache`
4. Returns the price to the client

Cache TTL per source:
- eBay sold listings: 6 hours (based on recent sales volume)
- Scryfall: 24 hours (updates daily)
- YGOPRODeck: 12 hours

### Pricing Sources by Game

| Game | Card identification | Primary pricing | Fallback |
|---|---|---|---|
| Pokemon TCG | PokémonTCG.io | eBay sold listings | Cached last known price |
| One Piece TCG | Internal database | eBay sold listings | Cached last known price |
| Magic: The Gathering | Scryfall | Scryfall (includes TCGPlayer market data) + eBay | Cached last known price |
| Yu-Gi-Oh! | YGOPRODeck | YGOPRODeck pricing + eBay | Cached last known price |

### eBay Browse API — Primary Pricing Source

The eBay Browse API is publicly available with a free developer account. It provides access to completed (sold) listings, which represent actual market transactions.

**How pricing is derived:**
1. Construct a search query from card metadata: `"{card name} {set} {card number} {condition}"`
2. Filter to completed/sold listings only
3. Collect the last 10–20 sold prices
4. Calculate: low, median, and market average
5. Store all three in `PriceCache` alongside the raw sale count for confidence scoring

**Confidence scoring:**
Cards with fewer than 5 recent sold listings are flagged as low-confidence prices. The UI surfaces this to the user so they can verify manually before making a high-value offer.

**Developer setup:**
- Create a free account at developer.ebay.com
- Register an application to receive API credentials
- Use the Browse API `search` endpoint with `buyingOptions: AUCTION,FIXED_PRICE` and `completedItems: true`

### Scryfall (MTG)

Scryfall's free API includes MTG card data and regularly updated pricing sourced from multiple markets. No API key is required for standard usage.

- Card identification: set code + collector number
- Pricing fields: `usd`, `usd_foil`, `usd_etched` (near mint market price)
- Updates: daily

### YGOPRODeck (Yu-Gi-Oh!)

YGOPRODeck provides free card data and pricing for Yu-Gi-Oh!. No API key required.

- Card identification: card name or card ID
- Pricing: TCGPlayer market price is included in card data responses
- Updates: daily

### One Piece TCG — Card Database

One Piece TCG has less mature API infrastructure than other supported games. The card identification database will be:
- Sourced from the official One Piece TCG website and community databases at launch
- Maintained in the ProjectTCG database and updated manually when new sets release
- Supplemented by community open-source projects where available

Pricing for One Piece is handled entirely by eBay sold listings.

### Graceful Degradation

If a pricing source is unavailable or rate-limited:
1. Return the most recent cached price with a staleness warning and the cache age
2. If no cached price exists, return `null` — the UI shows "Price unavailable" and allows manual price entry
3. Never block a scan session due to a pricing failure — a transaction can always proceed with a manually entered price

---

## 11. Authentication & Authorization

### Authentication Flow

Supabase Auth handles all authentication. Supported methods:
- Email + password
- Apple Sign-In (required by Apple for iOS apps offering social login)
- Google Sign-In

Session tokens are stored securely using Expo SecureStore (iOS Keychain / Android Keystore). Sessions persist across app restarts.

### Authorization Model

| Action | Owner | Staff |
|---|---|---|
| View inventory | ✅ | ✅ |
| Add / edit inventory | ✅ | ✅ |
| Delete inventory items | ✅ | ❌ |
| Process transactions | ✅ | ✅ |
| View transaction history | ✅ | ✅ |
| View customer records | ✅ | ✅ |
| Edit customer records | ✅ | ✅ |
| View credit balances | ✅ | ✅ |
| Issue / apply store credit | ✅ | ✅ |
| View cost basis / margins | ✅ | ❌ |
| Create / edit rule sets | ✅ | ❌ |
| View audit log | ✅ | ❌ |
| Manage staff accounts | ✅ | ❌ |
| View / manage billing | ✅ | ❌ |
| Export data | ✅ | ❌ |

Authorization is enforced at two levels:
- **UI level:** Staff users do not see restricted screens or actions
- **Database level:** RLS policies on Supabase enforce the same restrictions — a staff user's auth token cannot access restricted data even with a direct API call

---

## 12. Payments & Subscriptions

### Mobile — RevenueCat

RevenueCat manages all in-app subscription logic for iOS and Android. It abstracts the complexity of Apple StoreKit and Google Play Billing, which is significant.

RevenueCat responsibilities:
- Subscription product configuration (Starter, Pro, Business tiers)
- Purchase and restore flow
- Subscription status tracking
- Webhook to Supabase Edge Function on subscription events (new subscription, upgrade, downgrade, cancellation, renewal failure)

The Supabase `store` record's `subscription_tier` and `subscription_status` are updated via the RevenueCat webhook. This is the single source of truth for entitlements.

### Web — Stripe (Phase 2)

When the web dashboard is built in Phase 2, Stripe handles web-based subscriptions. RevenueCat and Stripe are kept in sync via webhooks — both update the same `store.subscription_status` field.

---

## 13. Infrastructure & Deployment

### Environments

| Environment | Purpose |
|---|---|
| `development` | Local development — local Supabase via `supabase start` |
| `staging` | Deployed staging environment for testing before release |
| `production` | Live app serving real users |

### Mobile Builds — Expo EAS

- **Development builds:** `eas build --profile development` — installs on physical device for testing
- **Preview builds:** `eas build --profile preview` — internal distribution for team testing
- **Production builds:** `eas build --profile production` — submitted to App Store and Google Play
- **OTA updates:** `eas update` — pushes JavaScript bundle updates to production users without App Store review (for bug fixes and non-native changes)

### Supabase

- Database, Auth, Storage, Realtime, and Edge Functions are all hosted by Supabase
- Local development uses `supabase start` to run a full Supabase stack locally via Docker
- Database migrations are version-controlled in `packages/db/migrations/` and applied via `supabase db push`

### CI/CD — GitHub Actions

On every pull request:
- TypeScript type checking across all packages
- ESLint across all packages
- Unit tests (rules engine, validators, utilities)

On merge to `main`:
- Supabase migrations applied to staging
- Expo OTA update pushed to staging channel
- End-to-end smoke test (optional Phase 2)

---

## 14. Third-Party Dependencies

| Service | Purpose | Cost model |
|---|---|---|
| Supabase | Database, auth, storage, real-time, edge functions | Free tier → $25/mo Pro |
| Expo EAS | Mobile builds and OTA updates | Free tier → $99/mo Production |
| RevenueCat | Mobile subscription management | Free up to $2,500 MRR |
| Stripe | Web subscription billing (Phase 2) | 2.9% + $0.30 per transaction |
| eBay Browse API | Primary pricing source (all games via sold listings) | Free developer account at developer.ebay.com |
| Scryfall API | MTG card data and pricing | Free, no key required |
| YGOPRODeck API | Yu-Gi-Oh card data and pricing | Free, no key required |
| PokémonTCG.io API | Pokemon card identification data | Free, no key required for basic access |
| Google ML Kit | On-device OCR for card scanning | Free (on-device, no API calls) |

### API Keys Management

All third-party API keys are stored as Supabase secrets (environment variables for Edge Functions). No API keys are ever bundled into the mobile app binary.

---

## 15. Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (for local Supabase)
- Expo Go app (for development testing) or a physical device with a development build
- Xcode (Mac only, for iOS simulator)
- Android Studio (for Android emulator)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ProjectTCG.git
cd ProjectTCG

# Install dependencies
pnpm install

# Start local Supabase
pnpm supabase start

# Apply database migrations
pnpm supabase db push

# Start the mobile app
pnpm --filter mobile dev
```

### Environment Variables

```
# apps/mobile/.env.local
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase start>
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<from RevenueCat dashboard>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<from RevenueCat dashboard>
```

```
# supabase/.env (Edge Function secrets — never committed)
TCGPLAYER_API_KEY=<from TCGPlayer developer portal>
TCGPLAYER_API_SECRET=<from TCGPlayer developer portal>
```

### Key Development Commands

```bash
pnpm --filter mobile dev          # Start mobile app with Expo
pnpm --filter mobile ios          # Open in iOS simulator
pnpm --filter mobile android      # Open in Android emulator
pnpm supabase functions serve     # Run Edge Functions locally
pnpm typecheck                    # TypeScript check all packages
pnpm lint                         # ESLint all packages
pnpm test                         # Run all tests
```
