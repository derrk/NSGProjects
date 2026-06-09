# Business Model — ProjectTCG

**Version:** 0.1
**Last Updated:** May 2026

---

## Revenue Model

ProjectTCG operates on a **subscription SaaS model** with monthly and annual billing options. Annual billing is offered at a discount to improve cash flow predictability and reduce churn.

A hardware revenue stream is introduced in Phase 4 with the digital price tag system.

---

## Subscription Tiers

### Starter — $29/month *(~$290/year)*

**Target customer:** New operators, small vendors, individual resellers just getting started.

| Feature | Included |
|---|---|
| Users | 1 |
| Inventory size | Up to 2,500 cards |
| Card games supported | All supported games |
| Camera scanning | ✅ |
| Transaction modes | Trade-In, Retail Pricing |
| Rules engine | 1 saved rule set |
| Customer records | Basic (name + transaction log) |
| Offline mode | ✅ |
| CSV import | ✅ |
| Reporting | Basic inventory summary |
| Support | Email support |

---

### Pro — $79/month *(~$790/year)*

**Target customer:** Established shop owners and active vendors with significant inventory.

| Feature | Included |
|---|---|
| Users | Up to 3 |
| Inventory size | Unlimited |
| Card games supported | All supported games |
| Camera scanning | ✅ |
| Transaction modes | All modes (Trade-In, Buylist, Retail Pricing) |
| Rules engine | Unlimited saved rule sets |
| Customer records | Full (credit balances, full history) |
| Offline mode | ✅ |
| CSV import/export | ✅ |
| Reporting | Full analytics suite |
| Shareable buylist page | ✅ |
| Print tools (labels, buylist PDFs) | ✅ |
| Support | Priority email + chat support |

---

### Business — $149/month *(~$1,490/year)*

**Target customer:** Multi-employee shops, stores with multiple locations, high-volume operators.

| Feature | Included |
|---|---|
| Users | Up to 10 |
| Inventory size | Unlimited |
| Locations | Up to 3 |
| Card games supported | All supported games |
| Camera scanning | ✅ |
| Transaction modes | All modes |
| Rules engine | Unlimited, per-location rule sets |
| Customer records | Full, shared across locations |
| Offline mode | ✅ |
| CSV import/export | ✅ |
| Reporting | Advanced (per-location, margin analysis, custom date ranges) |
| Platform integrations | TCGPlayer, eBay, Shopify *(Phase 3)* |
| POS sync | Square, Clover *(Phase 3)* |
| API access | ✅ *(Phase 3)* |
| Support | Dedicated support + onboarding call |

---

### Enterprise — Custom Pricing *(Phase 4+)*

**Target customer:** Large multi-location operations, chains, distributors deploying digital price tag systems.

Includes everything in Business tier plus:
- 10+ users, unlimited locations
- Digital price tag hardware and software
- Custom integrations
- SLA-backed uptime guarantee
- Dedicated account manager
- Custom reporting and data exports

---

## Hardware Revenue (Phase 4)

The digital price tag system introduces a hardware revenue component alongside the software subscription.

**Hardware model (proposed):**

| Option | Description | Price point |
|---|---|---|
| Starter kit | 50 e-ink tags + gateway hub | ~$299 one-time |
| Expansion pack | 50 additional tags | ~$149 one-time |
| Enterprise lease | Hardware leased monthly, included in Enterprise subscription | Bundled |

Hardware margins are secondary to the subscription stickiness they create. A shop that has deployed 200+ price tags is highly unlikely to churn — the switching cost becomes very high.

---

## Revenue Projections

> **Note:** The following projections are illustrative models based on conservative assumptions. Actual results will depend on go-to-market execution, market reception, and capital available for growth. These figures should be refined with real market data as early customers are acquired.

### Assumptions
- Primary acquisition channel: direct outreach, TCG community (Reddit, Discord, conventions)
- Average Revenue Per User (ARPU): blended across tiers, estimated ~$65/month in steady state
- Monthly churn: 5% (conservative for early SaaS)
- Annual growth in subscriber base: driven by marketing and word-of-mouth

### Conservative Scenario

| Period | Subscribers | MRR | ARR |
|---|---|---|---|
| Month 3 (post-launch) | 25 | ~$1,625 | ~$19,500 |
| Month 6 | 75 | ~$4,875 | ~$58,500 |
| Month 12 | 150 | ~$9,750 | ~$117,000 |
| Month 18 | 300 | ~$19,500 | ~$234,000 |
| Month 24 | 500 | ~$32,500 | ~$390,000 |

### Moderate Scenario

| Period | Subscribers | MRR | ARR |
|---|---|---|---|
| Month 6 | 150 | ~$9,750 | ~$117,000 |
| Month 12 | 400 | ~$26,000 | ~$312,000 |
| Month 18 | 800 | ~$52,000 | ~$624,000 |
| Month 24 | 1,500 | ~$97,500 | ~$1,170,000 |

At the moderate scenario Month 24 mark, the product reaches **$1M+ ARR** — a common threshold for Series A consideration and a strong signal for investor conversations.

---

## Unit Economics

| Metric | Target |
|---|---|
| Customer Acquisition Cost (CAC) | < $150 (organic/community-driven acquisition) |
| Customer Lifetime Value (LTV) | ~$780 (12-month avg. at $65/mo, 5% churn) |
| LTV:CAC Ratio | > 5:1 (healthy SaaS benchmark is 3:1+) |
| Gross Margin | 70–80% (SaaS infrastructure costs primary variable) |
| Payback Period | < 3 months at target CAC |

---

## Cost Structure

### Year 1 (Pre-Revenue Through Early Growth)

| Cost Category | Notes |
|---|---|
| Development | Primary cost — founder time + potential contractor costs |
| Infrastructure | Cloud hosting, database, API costs (scales with usage) |
| Pricing APIs | TCGPlayer, Scryfall, etc. — per-call or subscription costs |
| App Store fees | Apple 15–30%, Google 15% on subscription revenue |
| Marketing | Convention presence, digital advertising, community sponsorships |
| Legal / incorporation | Entity formation, terms of service, privacy policy |
| Customer support | Founder-handled in early stages |

### Infrastructure Cost Scaling
Cloud infrastructure costs are the primary variable expense and scale with user count and scan volume. At early subscriber counts, infrastructure costs should remain well under 15% of revenue.

---

## Go-To-Market Strategy

### Phase 1 — Community-Led Growth

The TCG operator community is small, tight-knit, and highly active on specific platforms. Direct community engagement is the most cost-effective customer acquisition channel at launch.

**Channels:**
- **Reddit** — r/pkmntcg, r/mtgfinance, r/onepiece, r/yugioh, and TCG shop owner communities
- **Discord** — TCG trader and shop owner Discord servers
- **Conventions and card shows** — Demo the app in person to vendors; every convention is a concentrated audience of target customers
- **YouTube / TikTok** — TCG content creators who cover the "business side" of the hobby
- **Direct outreach** — Identify shop owners via Google Maps in key markets and reach out directly

**Launch offer:** Offer a free 30-day trial with no credit card required. Early adopters get a discounted annual rate locked in for life.

### Phase 2 — Content and Word-of-Mouth

- Case study content: publish results from early shop owner users ("How [Shop Name] saved X hours per week on trade-ins")
- Referral program: existing subscribers get one month free for each referred subscriber
- App Store optimization and review campaigns

### Phase 3 — Paid Acquisition and Partnerships

Once unit economics are validated and MRR is growing consistently:
- TCGPlayer partnership or integration marketing
- Paid social (Facebook/Instagram for shop owner demographics)
- Sponsorships of TCG content creators and convention events

### Phase 4 — Enterprise Sales (Digital Tags)

- Direct sales outreach to established shops and small chains
- Demonstration units sent to high-profile shop owners for review
- Partner with TCG distributors and wholesalers who already have relationships with shop owners

---

## Funding Strategy

### Bootstrapped Phase (Current)
The product can be developed to MVP and early revenue without external funding, using founder time and minimal infrastructure spend.

**Target before raising:** 
- Working MVP used by at least 20 real shops
- $5,000+ MRR demonstrating willingness to pay
- Clear evidence of retention (< 10% monthly churn)

### Seed Round Considerations
If growth is constrained by development capacity or marketing spend, a seed raise becomes relevant. Seed funding would be applied to:
- Engineering team (mobile + backend developer)
- Accelerated go-to-market (conventions, content, paid acquisition)
- Phase 3 integration development
- Legal and operational infrastructure

**Seed round target:** $500K–$1.5M at a valuation supported by ARR and growth rate at time of raise.

### Series A Considerations
A Series A becomes relevant when the product has reached $1M+ ARR with consistent month-over-month growth and the Phase 4 hardware product creates a new revenue dimension that requires capital to manufacture and distribute at scale.

---

## Key Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| TCGPlayer or major platform launches competing product | Medium | Build moat with rules engine, offline capability, multi-game support, and hardware layer they won't replicate |
| Pricing API access restricted or cost increases | Medium | Multi-source pricing architecture from day one; no single API dependency |
| Low willingness to pay in target market | Low | Market validation with target personas before launch; free trial de-risks adoption |
| Card scanning accuracy insufficient for production use | Medium | Hybrid OCR + image recognition with manual fallback; accuracy KPI tracked from prototype |
| Hardware supply chain issues (Phase 4) | Medium | Partner with established ESL hardware vendor rather than manufacturing proprietary hardware |
