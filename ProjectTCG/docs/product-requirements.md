# Product Requirements Document — ProjectTCG

**Version:** 0.1
**Last Updated:** May 2026
**Scope:** Phase 1 — Mobile App (iOS and Android)

---

## Overview

This document defines the complete feature requirements for Phase 1 of ProjectTCG. It covers user roles, functional requirements, user stories, and acceptance criteria for every feature in the initial mobile app release.

---

## User Roles

### Owner
Full access to all features. Manages store settings, subscription, rule sets, staff accounts, and financial data. Typically the shop owner or primary operator.

### Staff
Operational access only. Can scan cards, process transactions, view and edit inventory, and access customer records. Cannot view financial reports, manage rule sets, manage other users, or access billing.

### Customer *(external, no login)*
Customers have no login. Their records (name, store credit balance, transaction history) are created and managed by the Owner or Staff.

---

## Feature Requirements

---

### 1. Authentication and Account Management

**FR-AUTH-001** — Users must be able to create an account with email and password.

**FR-AUTH-002** — Users must be able to log in with email/password and via Apple Sign-In (required for iOS App Store compliance) and Google Sign-In.

**FR-AUTH-003** — Password reset via email must be available.

**FR-AUTH-004** — Owner can invite Staff users by email. Invited users receive an email with a setup link.

**FR-AUTH-005** — Owner can revoke Staff access at any time.

**FR-AUTH-006** — Sessions persist across app restarts. Users are not logged out unless they explicitly sign out or the account is deactivated.

**FR-AUTH-007** — All data transmitted between app and server must be encrypted (HTTPS/TLS).

#### User Stories
- As an Owner, I want to create an account so that I can set up my store and start using the platform.
- As an Owner, I want to invite a staff member by email so that they can help manage inventory and process transactions.
- As a Staff user, I want to log in to my account so that I can access the store's shared inventory and tools.

---

### 2. Onboarding

**FR-ONBOARD-001** — New users are guided through a setup flow covering: store name, primary games carried, subscription tier selection, and first inventory action (scan a card or import CSV).

**FR-ONBOARD-002** — The CSV import wizard accepts standard spreadsheet exports from common tools (Google Sheets, Excel) with column mapping assistance.

**FR-ONBOARD-003** — The onboarding flow is skippable and resumable.

**FR-ONBOARD-004** — A contextual help system (tooltips, first-use hints) guides users through key workflows without requiring them to read documentation.

#### User Stories
- As a new Owner, I want to import my existing spreadsheet inventory so that I don't have to re-enter hundreds of cards manually.
- As a new user, I want a guided setup so that I can start using the app within a few minutes of downloading it.

---

### 3. Card Scanning and Identification

**FR-SCAN-001** — The app must open the device camera and identify a card by reading the set number and card number printed on the card (OCR-based identification).

**FR-SCAN-002** — Card identity must be resolved to a specific card record in the game database (name, set, card number, rarity, card type).

**FR-SCAN-003** — Upon successful identification, the app must display: card name, set, number, rarity, current market price, and a condition selector.

**FR-SCAN-004** — Market price must be pulled from the appropriate pricing API for the identified game. Price must include a timestamp indicating when it was last updated.

**FR-SCAN-005** — If the camera scan fails to identify a card after a configurable number of attempts, the app must offer a manual search fallback (search by card name, set, or number).

**FR-SCAN-006** — The scanning interface must allow rapid sequential scanning — after adding a card, the camera must return to scanning mode within 2 seconds.

**FR-SCAN-007** — Cards must be scannable in normal indoor lighting conditions. The app should not require specialized lighting equipment.

**FR-SCAN-008** — Scan accuracy must be ≥ 95% under normal conditions (clean card face, reasonable lighting, camera within 6–12 inches of card).

**FR-SCAN-009** — Identified cards must show a confirmation screen with the card image (fetched from the game database) so the user can verify the identification before adding.

**FR-SCAN-010** — In offline mode, scanning initiates identification but pricing data is not available. The card can still be added to inventory with a pending price flag.

#### Supported Games and Pricing Sources

| Game | Identification Source | Pricing Source |
|---|---|---|
| Pokemon TCG | Pokemon TCG API (pokemontcg.io) | TCGPlayer |
| One Piece TCG | One Piece TCG card database | TCGPlayer |
| Magic: The Gathering | Scryfall API | Scryfall + TCGPlayer |
| Yu-Gi-Oh! | YGOPRODeck API | TCGPlayer |

#### User Stories
- As an Owner, I want to point my camera at a card and have it identified automatically so that I don't have to manually look up every card I'm adding.
- As a Staff member, I want to scan a card and immediately see its current market price so that I can make accurate pricing decisions during a transaction.
- As an Owner at a convention with poor WiFi, I want to still be able to scan cards and add them to inventory (even without live pricing) so that I don't lose track of what I'm acquiring.

---

### 4. Inventory Management

**FR-INV-001** — Each card record in inventory must store: card identity (game, set, name, number), condition, quantity, cost basis (what the store paid), sell price, market price (last synced), notes, variant type, and date added.

**FR-INV-002** — Variant types supported at launch: Standard, Holo, Reverse Holo, First Edition, Alternate Art, Full Art, Promo, Graded. Additional variants can be added per game.

**FR-INV-003** — Inventory must be searchable by card name, set name, set number, and game. Search results must appear within 1 second.

**FR-INV-004** — Inventory must be filterable by game, set, condition, variant, price range, quantity (in stock / low stock / out of stock), and date added.

**FR-INV-005** — Inventory must be sortable by card name, market price, sell price, cost basis, quantity, and date added.

**FR-INV-006** — Bulk edit must allow updating sell price, condition, or notes across multiple selected cards simultaneously.

**FR-INV-007** — Low stock alerts must trigger when a card's quantity falls to or below a configurable threshold (default: 1). Alerts appear in the app notification center.

**FR-INV-008** — The inventory dashboard must display: total card count, total inventory value at cost, total inventory value at current market price, and total inventory value at set sell prices.

**FR-INV-009** — Deleting a card from inventory requires confirmation and is logged in the audit trail.

**FR-INV-010** — Inventory must support up to 2,500 cards on Starter tier and unlimited on Pro and Business tiers.

#### User Stories
- As an Owner, I want to search my inventory for a specific card quickly so that I can answer a customer's question without making them wait.
- As an Owner, I want to see the total market value of my inventory at any time so that I can understand my business's asset position.
- As a Staff member, I want to bulk update sell prices after a repricing session so that I don't have to edit each card individually.

---

### 5. Transaction Modes

All transaction modes share a common session model:
- A session is opened with a selected mode and active rule set
- Cards are added to the session via scanning or manual lookup
- Each card in the session shows: identity, condition, market price, and calculated value (mode-dependent)
- The session shows a running total
- The session can be saved, cancelled, or held (paused for later)
- Completed sessions are saved as transaction records

---

#### 5A. Trade-In Mode

**FR-TRADE-001** — Owner or Staff can start a Trade-In session at any time.

**FR-TRADE-002** — The active rule set is displayed at the top of the Trade-In session screen and can be switched before or during the session.

**FR-TRADE-003** — As each card is scanned, the app applies the active rule set and displays: market value, calculated trade-in offer (store credit), and calculated cash offer (if configured).

**FR-TRADE-004** — Individual cards can be accepted, countered (manual override of offer value), or removed from the session.

**FR-TRADE-005** — The session displays a running total of store credit value and cash value for all accepted cards.

**FR-TRADE-006** — When completing a session, the user can assign it to an existing customer or create a new customer record.

**FR-TRADE-007** — Upon session completion, accepted cards are added to inventory at the offer price as cost basis.

**FR-TRADE-008** — Completed trade sessions are saved with: timestamp, customer (if assigned), list of cards with individual offer values, total offer value, and offer type (store credit / cash / split).

#### User Stories
- As an Owner, I want to scan all the cards a customer is bringing to trade and immediately see what I should offer for the whole lot so that I can process trades quickly and accurately.
- As an Owner, I want to manually override the calculated offer on a specific card without affecting the rest of the session so that I can account for factors the rule doesn't cover (e.g., card has minor damage not captured by condition grades).
- As a Staff member, I want the trade-in workflow to be fast enough that a customer doesn't wait more than a few minutes while I process their cards.

---

#### 5B. Buylist Mode

**FR-BUY-001** — Buylist Mode shares the same scan workflow as Trade-In Mode.

**FR-BUY-002** — Buylist Mode displays both cash offer and store credit offer side by side for each card.

**FR-BUY-003** — A completed Buylist session can be shared as a text summary or exported as a PDF offer sheet.

**FR-BUY-004** — The offer can be locked for a configurable duration (e.g., "this offer is valid for 24 hours").

**FR-BUY-005** — The offer expiration time and lock duration are displayed on the summary screen.

#### User Stories
- As an Owner, I want to generate a printed or shareable offer sheet from a buylist session so that I can hand it to a customer or send it to them digitally.

---

#### 5C. Retail Pricing Mode

**FR-RETAIL-001** — Retail Pricing Mode is initiated when adding newly acquired cards to inventory.

**FR-RETAIL-002** — For each scanned card, the app suggests a sell price calculated as: cost basis (entered by user) + target margin % (configured in settings).

**FR-RETAIL-003** — The suggested sell price can be accepted, modified, or skipped per card.

**FR-RETAIL-004** — Cards processed in Retail Pricing Mode are added directly to inventory with the confirmed sell price.

**FR-RETAIL-005** — The session shows total acquisition cost, total expected revenue at suggested prices, and estimated margin for the session.

#### User Stories
- As an Owner, I want to scan a collection I just bought and quickly set sell prices based on my target margin so that I can get cards priced and ready to sell as fast as possible.

---

### 6. Rules Engine

**FR-RULES-001** — Owner can create, name, edit, and delete rule sets.

**FR-RULES-002** — Each rule set contains one or more rules. Rules are evaluated in order and the first matching rule applies.

**FR-RULES-003** — Rule parameters:
- Minimum market value threshold (e.g., only applies to cards ≥ $10.00)
- Maximum market value threshold
- Offer percentage of market value (store credit)
- Cash offer percentage of market value (optional, separate from credit)
- Condition modifier (e.g., Moderately Played reduces offer by an additional 10%)
- Card type exclusion (e.g., exclude cards with rarity = Common)
- Game filter (rule applies only to specified games)

**FR-RULES-004** — A default rule handles cards that don't match any specific rule (e.g., "all other cards: offer 50% credit").

**FR-RULES-005** — Rule sets are displayed with a plain-language summary of their logic (e.g., "Cards ≥ $10: 80% store credit / 60% cash. Cards < $10: 50% store credit / no cash offer.").

**FR-RULES-006** — Starter tier is limited to 1 saved rule set. Pro and Business tiers have unlimited rule sets.

#### User Stories
- As an Owner, I want to create separate rule sets for my standard buylist and my weekend event special so that I can switch between them without manually reconfiguring anything.
- As an Owner, I want condition modifiers in my rules so that a Moderately Played card automatically gets a lower offer than a Near Mint card of the same value.

---

### 7. Customer Records

**FR-CUST-001** — Owner or Staff can create a customer record with: name, optional phone number, optional email, optional notes.

**FR-CUST-002** — Each customer record shows: contact info, store credit balance, transaction history (all completed trade-in and buylist sessions), and total lifetime value traded.

**FR-CUST-003** — Store credit can be issued (from a completed trade session), applied (manual entry when customer uses credit), and adjusted (manual override with a required note).

**FR-CUST-004** — Credit balance history is logged: every change to the balance shows timestamp, amount, type (issued / applied / adjusted), and the user who made the change.

**FR-CUST-005** — Customer list is searchable by name, phone number, and email.

#### User Stories
- As an Owner, I want to look up a customer's store credit balance quickly when they come in to spend it so that I can tell them their balance without delays.
- As an Owner, I want a record of every trade a customer has done with my store so that I can see their history and build a relationship.

---

### 8. Offline Mode

**FR-OFFLINE-001** — The app must function without internet connectivity for core workflows: viewing inventory, scanning cards (identification only, no live pricing), and processing transactions.

**FR-OFFLINE-002** — All changes made offline must be queued locally and synced to the server when connectivity is restored.

**FR-OFFLINE-003** — The app must display a clear, persistent indicator when operating in offline mode.

**FR-OFFLINE-004** — Cached card prices (from the last successful sync) must be available offline with a visible "last updated" timestamp.

**FR-OFFLINE-005** — If two users make conflicting edits to the same inventory record while offline, the conflict must be logged and flagged for Owner review after sync.

**FR-OFFLINE-006** — The app must not lose any locally queued changes due to a crash or force-close before sync.

---

### 9. Multi-User and Audit Trail

**FR-MULTI-001** — All inventory edits, transaction completions, customer record changes, and rule set changes are logged with: timestamp, action type, affected record, and the user who performed the action.

**FR-MULTI-002** — The audit log is accessible to Owner only.

**FR-MULTI-003** — Staff users cannot view financial data (cost basis, margins, revenue reports).

**FR-MULTI-004** — Staff users cannot modify rule sets, subscription settings, or user accounts.

---

### 10. Notifications and Alerts

**FR-NOTIF-001** — Low stock alerts are delivered as in-app notifications when a card's quantity reaches the configured threshold.

**FR-NOTIF-002** — Sync conflict notifications alert the Owner when offline changes require review after syncing.

**FR-NOTIF-003** — Push notifications are opt-in. Users who deny push permissions receive in-app notifications only.

---

## Non-Functional Requirements

### Performance
- App launch to usable state: < 3 seconds on mid-range devices
- Inventory search results: < 1 second
- Camera to card identified: < 5 seconds under normal conditions
- Market price fetch: < 3 seconds on standard mobile connection

### Reliability
- App must not crash during active transaction sessions
- Local data (inventory, queued changes) must survive app crashes and device restarts
- Server uptime target: 99.5% monthly

### Security
- All data encrypted in transit (TLS 1.2+)
- All user data encrypted at rest in the database
- Authentication tokens expire and refresh automatically
- No sensitive data (pricing API keys, auth tokens) stored in plain text on device

### Privacy
- User and customer data is stored per-account and never shared between accounts
- Users can request a full data export of their account
- Users can request account deletion (GDPR/CCPA compliance)

### Scalability
- Architecture must support multi-tenant data isolation from day one
- Infrastructure must scale horizontally as subscriber count grows

### Accessibility
- App must meet WCAG 2.1 AA accessibility standards
- Support iOS and Android native accessibility features (VoiceOver, TalkBack)
- Minimum touch target size: 44x44 points

---

## Out of Scope for Phase 1

The following are explicitly excluded from Phase 1 and documented here to prevent scope creep:

- Web browser interface (Phase 2)
- Platform integrations — TCGPlayer, eBay, Shopify (Phase 3)
- Digital price tags (Phase 4)
- Sports card support (Phase 5)
- Sealed product inventory (booster boxes, packs)
- Full POS functionality
- Tournament / event management
- Consumer-facing marketplace
- Bluetooth scanner peripheral support
