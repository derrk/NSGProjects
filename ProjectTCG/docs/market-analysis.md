# Market Analysis — ProjectTCG

**Version:** 0.1
**Last Updated:** May 2026

---

## Market Overview

The trading card game industry has evolved from a niche hobby into a mainstream collectibles market. What was once dominated by a single game (Magic: The Gathering) has expanded into a diverse ecosystem of titles — Pokemon TCG, Yu-Gi-Oh!, One Piece TCG, Lorcana, Flesh & Blood, and others — each with active player bases, competitive scenes, and secondary markets for singles and sealed product.

This growth has created a new class of business operator: the independent TCG shop owner or vendor who buys, sells, and trades cards as a primary or supplementary income source. This operator class has grown rapidly but largely without purpose-built software to support their workflows.

---

## Market Size

### Total Addressable Market (TAM)

The global trading card market — encompassing TCGs, sports cards, and collectible card games — is estimated at several billion dollars annually in retail value, with the secondary (resale) market adding substantially to that figure. The operational software layer serving this market remains a small fraction of its potential, representing a significant greenfield opportunity.

Key market indicators:
- Pokemon TCG consistently ranks among the top-selling toy and hobby products globally
- One Piece TCG has seen explosive growth since its English-language launch, driven by the anime's mainstream popularity
- The US hobby retail market (game stores, card shops) numbers in the thousands of independent operators
- Convention and flea market card vendors represent a comparable or larger population of informal operators
- Sports cards (Phase 5 target) represent a market estimated in the billions of dollars annually in the United States alone

### Serviceable Addressable Market (SAM)

The SAM is defined as independent TCG shop owners, vendors, and online resellers in English-speaking markets (US, Canada, UK, Australia) who:
- Operate as a primary business or significant side business (not casual collectors)
- Manage recurring inventory of at least several hundred cards
- Would benefit from and could afford a SaaS subscription in the $29–$149/month range

Estimated SAM: thousands of operators in the US alone, with comparable populations in other English-speaking markets and an expansion opportunity into non-English markets (Japan, Europe) in later phases.

### Serviceable Obtainable Market (SOM)

Conservative year-one target: capture a small but meaningful percentage of the US market through direct outreach to the shop owner community, social media presence in TCG communities, and word-of-mouth among vendors at conventions and events.

*Detailed revenue projections are documented in [business-model.md](business-model.md).*

---

## Competitive Landscape

### Direct Competitors

**Rare Candy**
A mobile app focused primarily on scanning cards and retrieving market prices. Widely used in the Pokemon TCG community for quick price checks. Does not offer inventory management, transaction workflow tools, multi-user support, or a rules engine for trade/buy calculations. Functions as a price lookup tool rather than a business management platform.

**Collectr**
A collection tracking app aimed more at collectors than shop operators. Supports multiple card types and allows catalog management, but lacks the transaction workflow features (trade-in modes, buylist generation, rules engine) that a business operator needs. No staff/multi-user model.

**TCGPlayer Pro / TCGPlayer for Stores**
TCGPlayer's own seller tools are tightly coupled to their marketplace. Strong for stores that sell primarily through TCGPlayer but does not serve the physical store, convention, or multi-platform seller well. No scanning workflow or transaction modes.

**Crystal Commerce**
A legacy POS and inventory system used by some established game stores. Covers more ground but is expensive, complex, and not mobile-friendly. Designed for a broader game store inventory (board games, miniatures, etc.) rather than optimized for cards specifically.

**Spreadsheets (Google Sheets / Excel)**
The de facto "tool" for most independent operators. Free, flexible, and familiar — but requires manual data entry, provides no live pricing, cannot scan cards, and does not scale beyond a few hundred cards before becoming unmanageable.

### Competitive Positioning Summary

| | Price lookup | Inventory mgmt | Transaction modes | Rules engine | Multi-user | Offline | Digital tags |
|---|---|---|---|---|---|---|---|
| **ProjectTCG** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *(Phase 4)* |
| Rare Candy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Collectr | ✅ | ✅ | ❌ | ❌ | ❌ | Partial | ❌ |
| TCGPlayer Pro | ✅ | Partial | ❌ | ❌ | Partial | ❌ | ❌ |
| Crystal Commerce | Partial | ✅ | Partial | ❌ | ✅ | ❌ | ❌ |
| Spreadsheets | ❌ | Manual | ❌ | ❌ | Limited | ✅ | ❌ |

### Indirect Competitors

- **General inventory management apps** (Sortly, Inventory Now) — not card-aware, no pricing integration
- **POS systems** (Square, Clover) — handle transactions but not card-specific inventory or pricing
- **eBay / TCGPlayer seller tools** — useful for listing management only, not holistic operations

### Competitive Moat

The combination of the **rules engine**, **multi-mode scanning workflow**, and the long-term **digital price tag system** creates a defensible position that general inventory tools and narrow price-lookup apps cannot easily replicate. The rules engine in particular requires deep understanding of how TCG businesses operate — knowledge that is not obvious to outside developers and takes time to build correctly.

---

## Target Customer Profiles

### Persona 1 — The Growing Shop Owner
**Profile:** Operates a physical TCG shop, 1–3 employees, sells singles and sealed product. Has been in business 1–5 years. Currently tracks inventory in a combination of spreadsheets and memory. Uses Rare Candy or TCGPlayer for price checks. Struggles with trade-in transactions — spends too much time calculating offers and occasionally makes costly mistakes.

**Pain points:** No single system for everything; trade calculations are slow and error-prone; hard to know true inventory value at any given time; repricing physical displays is a daily labor cost.

**What they need from us:** A tool that makes trade-ins fast and accurate, gives them a real-time picture of inventory value, and reduces the daily work of running the shop.

**Willingness to pay:** $50–$100/month if the tool demonstrably saves time and reduces errors.

---

### Persona 2 — The Convention and Event Vendor
**Profile:** Sells cards at flea markets, card shows, and regional conventions. May or may not have a physical storefront. Mobile-first by necessity — all work happens on a phone or tablet. Internet connectivity at venues is unreliable. Moves high volumes of lower-value cards alongside premium singles.

**Pain points:** No reliable offline tool; carrying physical price lists is cumbersome and outdated instantly; calculating trade values on the fly is slow and causes missed sales; no record of past transactions.

**What they need from us:** A fast, offline-capable mobile app that works in any environment and makes trade-in calculations instant.

**Willingness to pay:** $30–$60/month. Price-sensitive but highly motivated by time savings at events.

---

### Persona 3 — The Online Reseller
**Profile:** Sells primarily through TCGPlayer, eBay, and/or their own website. Sources inventory from local game stores, collections, and other resellers. May not have a physical location. Manages hundreds to thousands of SKUs across multiple platforms.

**Pain points:** Keeping inventory counts synced across platforms; knowing true cost basis and margin per card; identifying underpriced cards when buying collections.

**What they need from us:** Inventory as a central source of truth with platform sync, margin tracking, and collection valuation tools.

**Willingness to pay:** $40–$80/month. ROI-focused; will pay if the tool demonstrably improves margins or reduces listing errors.

---

### Persona 4 — The New Operator *(Early Adopter)*
**Profile:** Recently entered the TCG business — within the past 1–2 years. May have started as a collector. Inventory is still manageable (hundreds to ~1,000 cards) but is growing fast. Has not yet committed to any operational system.

**Pain points:** Feeling overwhelmed as inventory grows; no established system to build on; making pricing mistakes due to lack of experience with market values.

**What they need from us:** A system that grows with them — easy to start with, powerful as the business scales.

**Willingness to pay:** $20–$40/month at entry level. This persona is the ideal early adopter: no switching cost, high motivation, and long customer lifetime value as the business grows.

---

## Market Trends Supporting This Opportunity

**New titles driving new operators.** One Piece TCG's explosive English-language growth has created a wave of new shops and vendors in the past two years. Each new major title creates a new cohort of operators who are still forming their operational habits.

**Collector-to-operator pipeline.** A significant portion of shop owners started as collectors. As the hobby has grown, more collectors have transitioned into informal and formal sales businesses, many without any operational infrastructure.

**Digital price tag technology maturation.** ESL (Electronic Shelf Label) hardware has become significantly cheaper and more accessible over the past five years. What once required enterprise retail investment is now feasible for small businesses — especially with a software platform managing the pricing logic.

**Sports card market convergence.** The sports card industry has seen its own boom and shares many operational similarities with TCG shops. A platform that serves TCG operators well is well-positioned to expand into sports cards, effectively doubling the addressable market.

**Lack of vertical-specific SaaS.** Unlike restaurants (Toast, Square for Restaurants), salons (Vagaro, Mindbody), or even comic shops (ComicBase), TCG shops have no dominant vertical SaaS solution. This is the window of opportunity.
