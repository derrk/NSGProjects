# Product Roadmap — ProjectTCG

**Version:** 0.1
**Last Updated:** May 2026

---

## Vision

To become the operating system for trading card businesses — the single platform shop owners, vendors, and resellers open every day to run their business, from the first scan of the morning to the last sale of the night.

---

## Roadmap Overview

| Phase | Name | Focus | Target |
|---|---|---|---|
| Phase 1 | **Foundation** | Mobile app, core scanning, inventory, transaction modes | MVP Launch |
| Phase 2 | **Web Platform** | Browser-based dashboard, advanced reporting, buylist pages | 6 months post-launch |
| Phase 3 | **Integrations** | TCGPlayer sync, eBay, Shopify, POS | 12 months post-launch |
| Phase 4 | **Digital Price Tags** | ESL hardware + software for shelf automation | 18–24 months post-launch |
| Phase 5 | **Sports Cards** | Expand to sports card market | 24+ months post-launch |

---

## Phase 1 — Foundation

**Goal:** Ship a mobile app that is immediately more useful than a spreadsheet for any TCG shop owner or vendor. Prove the core loop: scan → identify → price → transact.

**Platforms:** iOS and Android

**Target games at launch:**
- Pokemon TCG
- One Piece TCG
- Magic: The Gathering
- Yu-Gi-Oh!

---

### Feature Set

#### Onboarding
- Account creation with store profile (name, location, games carried)
- Subscription tier selection
- CSV import wizard for migrating existing spreadsheets
- In-app onboarding walkthrough

#### Card Scanning & Identification
- Camera-based card scanning using set number OCR
- Card identity resolution via game-specific APIs
- Condition selection at scan time (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged)
- Manual lookup fallback (search by name/set/number)
- Live market price pull at scan time
- Cached pricing for offline use (prices stored with timestamp)

#### Inventory Management
- Add cards via scan, manual entry, or CSV import
- Card fields: name, set, card number, condition, quantity, cost basis, sell price, notes, variant flags
- Variant tracking: holo, reverse holo, first edition, alternate art, promo, graded
- Search and filter across full catalog
- Bulk edit (price, condition, quantity)
- Low stock alerts (configurable threshold per card)
- Inventory value dashboard (total at cost, total at market, total at sell price)

#### Transaction Modes
- **Trade-In Mode**
  - Open a trade session
  - Scan cards one at a time; condition selected per card
  - Rules engine applies active rule set to each card
  - Per-card breakdown: market value, calculated offer, condition adjustment
  - Running session total (trade credit value / cash value)
  - Accept, counter, or remove individual cards from session
  - Save completed trade as a transaction record
  - Assign to existing or new customer

- **Buylist Mode**
  - Same scan workflow as Trade-In
  - Outputs cash offer vs. store credit offer side by side
  - Option to lock offer for a configurable duration
  - Shareable summary (text or PDF) to hand or send to customer

- **Retail Pricing Mode**
  - Scan cards being added to stock
  - App suggests sell price: cost basis + target margin %
  - Bulk price a collection in a single session
  - Apply prices directly to inventory

#### Rules Engine
- Create and name multiple rule sets (e.g., "Standard Buylist", "Event Weekend Rules")
- Rules configurable per game or applied globally
- Rule parameters:
  - Offer percentage (% of market value)
  - Minimum card value threshold
  - Condition modifiers (e.g., reduce offer by 10% for Moderately Played)
  - Card type exclusions (e.g., exclude bulk commons)
- Activate/deactivate rule sets per session
- Rule sets saved per store account

#### Customer Records
- Create customer profiles (name, contact info optional)
- Transaction history per customer
- Store credit balance tracking
- Credit issued, credit applied, balance history

#### Offline Mode
- Full inventory access offline
- Transaction sessions can be started and completed offline
- All changes queue locally
- Sync to cloud when connectivity is restored
- Conflict resolution: last-write-wins with conflict log
- Indicator showing sync status and last sync time
- Pricing data not available offline (cached prices shown with age indicator)

#### Multi-User
- Owner account with full permissions
- Staff role: can scan, view inventory, process transactions — cannot edit rules, view financials, or manage users
- Audit log of actions by user

#### Settings
- Store profile management
- Subscription and billing management
- Rule set configuration
- Game and pricing source preferences
- Notification preferences

---

### Phase 1 Milestones

| Milestone | Description |
|---|---|
| M1 — Architecture complete | Tech stack finalized, repo structured, environments configured |
| M2 — Scanning prototype | Camera scan → card identified → price displayed |
| M3 — Inventory MVP | Add, edit, search, and view cards in inventory |
| M4 — Trade-In Mode MVP | End-to-end trade session with rules engine |
| M5 — Offline sync | Full offline capability with sync |
| M6 — Multi-user + auth | Owner and staff roles, account management |
| M7 — Beta launch | Closed beta with 10–20 real shop owners |
| M8 — Public launch | App Store and Google Play release |

### Phase 1 Success Metrics
- Scanning accuracy ≥ 95% on standard card conditions
- Trade-In session completion time reduced vs. manual workflow (user survey)
- ≥ 50 active paying subscribers within 60 days of public launch
- Churn rate < 10% monthly in first quarter

---

## Phase 2 — Web Platform

**Goal:** Give shop owners a full desktop experience for inventory management and reporting. Expand to serve the behind-the-counter use case.

**New capabilities:**
- Full web dashboard (browser-based, all features accessible)
- Advanced reporting: margin reports, inventory aging, top movers by game/set
- Shareable public buylist page (customers can see what you're buying and at what price)
- Bulk pricing tools optimized for desktop
- Print-ready price label and buylist sheet generation
- Keyboard shortcuts and barcode scanner peripheral support
- Data export (CSV, PDF)

### Phase 2 Milestones
| Milestone | Description |
|---|---|
| M1 — Web app scaffolding | Auth, navigation, inventory view in browser |
| M2 — Full inventory management | Parity with mobile for all inventory features |
| M3 — Reporting suite | Core analytics dashboards |
| M4 — Public buylist pages | Shareable, customer-facing buylist URLs |
| M5 — Print tools | Price labels and buylist PDFs |

### Phase 2 Success Metrics
- ≥ 60% of Pro and Business tier subscribers using web app weekly
- ≥ 200 total active paying subscribers
- Average session length on web > 10 minutes (indicates real work being done)

---

## Phase 3 — Platform Integrations

**Goal:** Make ProjectTCG the inventory hub that pushes to every sales channel.

**New capabilities:**
- **TCGPlayer Sync** — push inventory to TCGPlayer store, sync sold quantities back
- **eBay Integration** — create and manage eBay listings from inventory
- **Shopify Integration** — sync inventory to Shopify storefront
- **Square / Clover POS** — sync sales from physical POS back to inventory
- **Automated repricing** — configurable rules to auto-update TCGPlayer/eBay prices when market moves

### Phase 3 Milestones
| Milestone | Description |
|---|---|
| M1 — TCGPlayer sync | Two-way inventory sync with TCGPlayer seller account |
| M2 — eBay integration | Listing creation and sold order sync |
| M3 — Shopify integration | Inventory and order sync |
| M4 — POS sync | Square and Clover sold order import |
| M5 — Automated repricing | Rules-based auto-repricing across channels |

### Phase 3 Success Metrics
- ≥ 40% of Business tier subscribers using at least one platform integration
- Integration-related inventory discrepancy incidents < 1% of synced transactions
- ≥ 400 total active paying subscribers

---

## Phase 4 — Digital Price Tags

**Goal:** Eliminate daily manual repricing labor for physical card displays. Launch the first ESL (Electronic Shelf Label) system purpose-built for TCG shops.

**Overview:**
A serialized e-ink display tag is assigned to each physical card slot in a binder, display case, or singles box. The tag shows the current market-adjusted sell price for the card assigned to that slot. When market prices change past a configurable threshold, all affected tags update automatically — no manual repricing required.

**New capabilities:**
- Hardware: serialized e-ink display tags (white-label ESL hardware partnership or proprietary)
- Tag management dashboard: assign cards to tag IDs, view all active tags, identify tags needing battery replacement
- Auto-update rules: configure update triggers (e.g., price change > 10%, time-based daily sync)
- Tag update history and audit log
- Bulk tag assignment tools
- Mobile tag scanner: scan a tag to see which card is assigned, current price, price history

**Hardware model options:**
- White-label existing ESL hardware with proprietary firmware and software
- Hardware sold or leased with a premium subscription tier
- Hardware available through a one-time purchase with monthly software fee

### Phase 4 Milestones
| Milestone | Description |
|---|---|
| M1 — Hardware vendor selected | ESL hardware partner or manufacturer identified |
| M2 — Tag communication protocol | Tags communicate with app via gateway (WiFi/BLE) |
| M3 — Tag assignment system | Assign card IDs to tag serial numbers |
| M4 — Auto-update pipeline | Market price change → tag update trigger |
| M5 — Beta hardware program | 5–10 shop owners testing physical tag system |
| M6 — Commercial launch | Tags available for purchase/lease with Enterprise tier |

### Phase 4 Success Metrics
- Tag price update latency < 15 minutes from market price change trigger
- Tag battery life ≥ 6 months under normal update frequency
- ≥ 20 shops on Enterprise tier with active tag deployments within 6 months of launch
- Net Promoter Score improvement among Enterprise tier subscribers post-launch

---

## Phase 5 — Sports Cards

**Goal:** Expand the platform to the sports card market, significantly increasing the total addressable market.

**Key differences vs. TCG:**
- No standardized card database — identification relies on manufacturer, year, player, set, and variant
- Graded cards (PSA, BGS, SGC, CGC) are a major segment — condition is a grade, not a subjective assessment
- Pricing sources: eBay sold listings (primary), 130point, Market Movers
- Much higher per-card values on premium cards — risk of scan misidentification is higher

**New capabilities:**
- Sports card database integration (Beckett, TCDB, or similar)
- Graded card tracking (grade, grader, cert number, population report data)
- eBay sold listing price pulls
- Submission tracking (send cards to grading, track status, receive back into inventory)
- Sports-specific transaction mode adjustments

### Phase 5 Milestones
| Milestone | Description |
|---|---|
| M1 — Sports card database | Integration with sports card identification database |
| M2 — eBay pricing integration | Sold listing price pulls for sports cards |
| M3 — Graded card support | Grade tracking, cert numbers, PSA/BGS lookup |
| M4 — Submission tracking | Grading submission workflow |
| M5 — Beta with sports card dealers | Closed beta with 10–20 sports card shops/vendors |

---

## Out of Scope (Intentionally Deferred)

The following features are intentionally excluded from the roadmap until Phase 3 or later, to protect focus and launch timeline:

- Full POS (point-of-sale) system — handled by Phase 3 integration with Square/Clover
- Sealed product inventory (booster boxes, packs) — separate inventory category, Phase 2
- Tournament and event management — separate product category
- B2B wholesale ordering — future consideration
- Consumer-facing marketplace — not a core use case
