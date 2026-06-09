# Product Brief — ProjectTCG

**Status:** Pre-Development
**Version:** 0.1
**Last Updated:** May 2026

---

## Executive Summary

ProjectTCG is a multi-platform SaaS solution for trading card game (TCG) retailers, vendors, and resellers. The platform consolidates inventory management, live market pricing, smart transaction workflows, and customer management into a single purpose-built tool — replacing the notebooks, spreadsheets, and fragmented apps that define the current state of the industry.

The core competitive advantage is a **context-aware scanning and rules engine**: operators scan cards in different modes (trade-in, buylist, retail pricing) and the platform automatically applies configurable business rules — such as offering 80% of market value for cards above $10 — delivering instant, accurate offers without manual calculation.

The long-term vision includes a proprietary **digital price tag system** purpose-built for TCG card displays, enabling automatic shelf-price updates as market values shift — a capability common in major retail (Best Buy, Walmart) that has never been applied to the trading card industry.

> **Note on pricing data:** TCGPlayer's developer API program has been closed to new applicants following eBay's acquisition of TCGPlayer. ProjectTCG uses eBay's sold listings API as its primary pricing source — real completed transaction data across all supported games — supplemented by game-specific APIs (Scryfall for MTG, YGOPRODeck for Yu-Gi-Oh!, PokémonTCG.io for Pokemon).

---

## The Problem

The trading card industry has experienced significant growth in recent years, driven by renewed collector interest, streaming culture, and the emergence of new TCG titles. Despite this growth, the operational tools available to shop owners and vendors remain primitive:

**Fragmented workflows.** Shop owners manage inventory in spreadsheets, look up prices in separate apps (Rare Candy, TCGPlayer), and record transactions in notebooks or phone photos. There is no single place that handles the full workflow.

**No integrated buying and trading tool.** Calculating a fair trade or buy value requires manually cross-referencing market prices, doing mental math for each card, and applying business rules from memory. A transaction with 40 cards becomes a slow, error-prone process that frustrates both the shop owner and the customer.

**Daily repricing labor.** Physical card displays require manual price updates as market values shift — a time-intensive task that creates pricing errors and shrinkage risk when displayed prices fall out of sync with actual market values.

**No scalable inventory system.** Spreadsheet-based tracking becomes unmanageable as inventory grows past a few hundred cards. Shop owners with tens of thousands of cards have no reliable way to know what they have, what it's worth, or what they've sold.

**Nothing built for this market.** Existing solutions are either too generic (general-purpose inventory management software) or too narrow (single-game pricing apps). No product addresses the full operational workflow of a multi-game card business.

---

## The Solution

ProjectTCG provides a unified platform built around the way card shops actually operate:

### Core Capabilities

**1. Smart Scanning**
Point a phone camera at a card. The app identifies it by set and card number, pulls the current market price from live pricing APIs, and prompts for condition. The card is added to the active session or inventory in seconds.

**2. Transaction Modes with Rules Engine**
The defining feature. Before scanning, the operator selects a mode:

- **Trade-In Mode** — Customer brings cards to trade. Scan each card, select condition, and the app applies the configured rule (e.g., "offer 80% of market value for cards ≥ $10, 60% for cards under $10"). The result is a per-card breakdown and a total offer value — instantly.
- **Buylist Mode** — Same workflow as trade-in but outputs a shareable offer sheet (cash vs. store credit options).
- **Retail Pricing Mode** — Scan cards coming into stock. App suggests sell price based on cost basis plus target margin percentage.

Rules are fully configurable per store. Multiple rule sets can be saved and switched between (e.g., "Weekend Event Rules" vs. "Standard Buylist").

**3. Inventory Management**
Full card catalog with search, filtering, bulk edit tools, condition tracking, quantity management, and cost basis recording. Offline-capable — edits queue locally and sync when connectivity is restored.

**4. Customer Records**
Trade history per customer, store credit balances, and transaction logs. Builds a customer relationship layer directly into the operational workflow.

**5. Reporting & Analytics**
Inventory valuation over time, margin analysis, top-selling and top-traded cards, customer volume reports.

**6. Digital Price Tags** *(Phase 4)*
Serialized e-ink display tags assigned to physical card slots. Tags show the current market-adjusted price for the card assigned to that slot. When market prices move past a configured threshold, tags update automatically — eliminating the need for daily manual repricing and preventing shrinkage from stale paper price tags.

---

## Key Differentiators

| Capability | ProjectTCG | Rare Candy | Collectr | Spreadsheets |
|---|---|---|---|---|
| Multi-game support | ✅ All major TCGs | Partial | ✅ | Manual |
| Transaction modes with rules engine | ✅ | ❌ | ❌ | Manual |
| Configurable offer rules | ✅ | ❌ | ❌ | ❌ |
| Offline-capable with sync | ✅ | ❌ | Partial | ✅ |
| Customer records and store credit | ✅ | ❌ | ❌ | Manual |
| Multi-user and staff roles | ✅ | ❌ | ❌ | Limited |
| Multi-location support | ✅ | ❌ | ❌ | ❌ |
| Digital shelf price tags | ✅ *(Phase 4)* | ❌ | ❌ | ❌ |
| Platform integrations (TCGPlayer, eBay) | ✅ *(Phase 3)* | ❌ | ❌ | ❌ |
| SaaS with subscription tiers | ✅ | ❌ | ❌ | ❌ |

---

## Target Market

**Primary — Independent TCG shop owners**
Brick-and-mortar stores ranging from small single-operator shops to established multi-employee stores. Managing inventory of hundreds to hundreds of thousands of cards. Currently using spreadsheets, Collectr, or informal tracking methods.

**Secondary — Vendors and convention sellers**
Individuals and small businesses selling at flea markets, card shows, and conventions. Need mobile-first tools that work in environments with unreliable internet.

**Tertiary — Online resellers**
Sellers on TCGPlayer, eBay, and similar platforms who need inventory management and listing sync tools.

**Phase 5 expansion — Sports card dealers**
A substantially larger total addressable market with similar operational needs and no dominant purpose-built SaaS solution.

---

## Why Now

- The TCG market has expanded significantly, bringing new shop owners into the industry who have not yet committed to any operational system — making them ideal early adopters with no switching cost.
- Existing tools have not kept pace with market complexity. As new games (One Piece TCG, Lorcana) gain mainstream traction, the need for multi-game support has grown.
- No dominant SaaS platform has established itself in this vertical. The market remains fragmented and underserved.
- Mobile-first habits among the target demographic lower the adoption barrier for a phone-based scanning workflow.
- Electronic shelf label (ESL) technology has matured and become cost-accessible — the timing is right to bring this to a vertical that has never seen it.

---

## The Team

*[To be completed — founder background, relevant experience, advisors]*
