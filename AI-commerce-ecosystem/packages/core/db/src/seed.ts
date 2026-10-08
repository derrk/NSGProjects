/**
 * Seed the database with everything the pipeline needs to run end to end.
 *
 * Includes the ten hand-written concepts the week-1 acceptance test calls for:
 * "10 hand-written concepts produce 30 designs the operator can pick from". Writing
 * them by hand is deliberate — the Trend scout is a week-4 agent, and the first sixty
 * concepts were always meant to be written in an afternoon.
 *
 * Idempotent: every insert is `onConflictDoNothing`, so re-running is safe.
 */

import { createDatabase } from './client'
import {
  blockedPhrases,
  concepts,
  niches,
  pricingRules,
  settings,
  shops,
  type Database,
} from './index'

const SHOP_SLUG = 'launch-shop'

/**
 * Well-known registered marks that turn up on print-on-demand apparel. The Scout and
 * Store ops both check copy against this list; the operator can add to it from the
 * settings screen. This is a starting point, not legal advice or a complete list.
 */
const BLOCKED_PHRASE_SEED: Array<{ phrase: string; reason: string }> = [
  { phrase: 'just do it', reason: 'Nike registered mark' },
  { phrase: 'i love new york', reason: 'New York State registered mark' },
  { phrase: 'super bowl', reason: 'NFL registered mark' },
  { phrase: 'march madness', reason: 'NCAA registered mark' },
  { phrase: 'olympic', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
  { phrase: 'olympics', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
  { phrase: 'life is good', reason: 'Life is Good Inc registered apparel mark' },
  { phrase: 'the happiest place on earth', reason: 'Disney registered mark' },
  { phrase: "let's get ready to rumble", reason: 'Michael Buffer registered mark' },
  { phrase: 'you only live once', reason: 'contested apparel mark; avoid' },
  { phrase: 'world cup', reason: 'FIFA registered mark' },
  { phrase: 'bad hombre', reason: 'contested apparel mark; avoid' },
]

/** Printify cost x multiple, rounded to .99. Verify blueprint ids before week 2. */
const PRICING_SEED = [
  { productType: 'mug_11oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1499 },
  { productType: 'mug_15oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1799 },
  { productType: 'tee', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 2199 },
  { productType: 'sweatshirt', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 3499 },
  { productType: 'hoodie', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 3999 },
]

/** Daily spend caps in cents, and the global pause switch. */
const SETTINGS_SEED = [
  { key: 'system.paused', value: false, description: 'Kills every cron within one tick' },
  { key: 'spend.cap.fal.daily_cents', value: 1500, description: 'fal.ai daily cap ($15)' },
  { key: 'spend.cap.anthropic.daily_cents', value: 1000, description: 'Anthropic daily cap ($10)' },
  { key: 'spend.cap.tavily.daily_cents', value: 200, description: 'Tavily daily cap ($2)' },
  {
    key: 'designs.variants_per_concept',
    value: 3,
    description: 'How many variants the Designer generates per approved concept',
  },
]

const NICHE_SEED = [
  {
    name: 'Nurses and healthcare workers',
    keywords: ['nurse gift', 'nurse mug', 'rn gift', 'night shift nurse'],
    audience: 'Friends and family buying for a nurse at Christmas',
    season: 'christmas-2026',
    score: 78,
    rationale:
      'Large, loyal, gift-heavy audience with strong in-group humour. Buyers are usually not the nurse, so the joke has to read instantly from a thumbnail.',
  },
  {
    name: 'Dog people',
    keywords: ['dog mom gift', 'dog dad mug', 'rescue dog', 'dog lover christmas'],
    audience: 'Gift buyers for dog owners who treat the dog as family',
    season: 'christmas-2026',
    score: 81,
    rationale:
      'Perennially the strongest giftable niche on POD. Competition is heavy, so the win is in specificity of voice rather than breadth.',
  },
  {
    name: 'Teachers',
    keywords: ['teacher gift', 'teacher mug', 'end of term gift', 'teacher christmas'],
    audience: 'Parents and students buying an end-of-term or Christmas gift',
    season: 'christmas-2026',
    score: 72,
    rationale:
      'Predictable December spike with a low price ceiling. Mugs over apparel: the buyer is often a child with a small budget.',
  },
]

/**
 * Ten concepts, written by hand. Each brief describes what the image should SHOW —
 * the Designer turns it into three distinct generation prompts, so the brief must
 * leave room for composition to vary.
 */
const CONCEPT_SEED = [
  {
    niche: 'Nurses and healthcare workers',
    title: 'Powered by caffeine and chaos',
    promptBrief:
      'Bold hand-lettered phrase "Powered by caffeine and chaos" arranged around a simple coffee cup with a stethoscope looped through the handle. Warm, tired, affectionate mood. No faces, no logos.',
    style: 'hand-lettered' as const,
    products: ['mug_11oz', 'mug_15oz', 'tee'],
  },
  {
    niche: 'Nurses and healthcare workers',
    title: 'Night shift survivor',
    promptBrief:
      'Retro badge roundel reading "Night Shift Survivor" with a crescent moon, a coffee cup and a heartbeat line forming the border. Muted navy and cream, worn letterpress feel.',
    style: 'retro-badge' as const,
    products: ['tee', 'sweatshirt', 'hoodie'],
  },
  {
    niche: 'Nurses and healthcare workers',
    title: 'Trust me, I check vitals for a living',
    promptBrief:
      'Clean flat-vector composition: a stylised clipboard with a heartbeat line, phrase set in a confident sans-serif beneath. Teal and charcoal, lots of negative space so it reads at thumbnail size.',
    style: 'flat-vector' as const,
    products: ['mug_11oz', 'tee'],
  },
  {
    niche: 'Dog people',
    title: 'Professional dog tired',
    promptBrief:
      'A sleepy cartoon dog slumped over a coffee cup, phrase "Professional Dog Tired" hand-lettered above. Soft, rounded, friendly line work. Generic mixed-breed dog, not a recognisable breed mascot.',
    style: 'hand-lettered' as const,
    products: ['mug_11oz', 'mug_15oz', 'sweatshirt'],
  },
  {
    niche: 'Dog people',
    title: 'My rescue rescued me',
    promptBrief:
      'Single-weight line-art drawing of a dog and a human profile facing each other, forming a heart in the negative space between them. Phrase set small beneath in a quiet serif.',
    style: 'line-art' as const,
    products: ['tee', 'sweatshirt', 'hoodie'],
  },
  {
    niche: 'Dog people',
    title: 'Walked. Fed. Still judged.',
    promptBrief:
      'Flat-vector dog sitting upright with a flatly unimpressed expression, phrase stacked in three lines beside it. Limited palette, two colours plus background.',
    style: 'flat-vector' as const,
    products: ['mug_11oz', 'tee'],
  },
  {
    niche: 'Dog people',
    title: 'Home is where the fur sticks',
    promptBrief:
      'Watercolour wash of a cosy armchair with a dog curled on it and visible fur tufts drifting in the air, phrase hand-lettered along the bottom. Autumnal, warm, slightly messy.',
    style: 'watercolor' as const,
    products: ['mug_15oz', 'sweatshirt'],
  },
  {
    niche: 'Teachers',
    title: "Fuelled by coffee and other people's children",
    promptBrief:
      'Hand-lettered phrase arranged in a stacked block around a coffee cup with a pencil resting across the top. Chalkboard palette: off-white lettering on deep green.',
    style: 'hand-lettered' as const,
    products: ['mug_11oz', 'mug_15oz'],
  },
  {
    niche: 'Teachers',
    title: 'Ask me about my 25 kids',
    promptBrief:
      'Retro badge with a schoolhouse silhouette and an apple, phrase curved around the top edge. Warm mustard and brick red, 1970s educational-poster feel.',
    style: 'retro-badge' as const,
    products: ['tee', 'sweatshirt'],
  },
  {
    niche: 'Teachers',
    title: 'Technically a professional glitter wrangler',
    promptBrief:
      'Flat-vector composition of scattered glitter specks, scissors and a glue stick arranged around the phrase. Playful, bright, high-contrast so it survives being printed small.',
    style: 'flat-vector' as const,
    products: ['mug_11oz', 'tee'],
  },
]

export async function seed(database?: Database): Promise<void> {
  const db = database ?? createDatabase()

  const [shop] = await db
    .insert(shops)
    .values({
      name: 'Launch Shop',
      slug: SHOP_SLUG,
      platform: 'shopify',
      status: 'building',
      fulfillment: 'pod',
      positioning: 'Original, funny gift designs for the people who are hard to buy for.',
      audience: 'Christmas gift buyers',
      productTypes: ['mug_11oz', 'mug_15oz', 'tee', 'sweatshirt', 'hoodie'],
      createdBy: 'operator',
    })
    .onConflictDoNothing({ target: shops.slug })
    .returning()

  // onConflictDoNothing returns nothing when the row already existed.
  const shopRow = shop ?? (await db.query.shops.findFirst({ where: (s, { eq }) => eq(s.slug, SHOP_SLUG) }))
  if (!shopRow) throw new Error('could not create or find the launch shop')

  await db
    .insert(blockedPhrases)
    .values(BLOCKED_PHRASE_SEED.map((p) => ({ ...p, createdBy: 'operator' })))
    .onConflictDoNothing()

  await db
    .insert(settings)
    .values(SETTINGS_SEED.map((s) => ({ ...s, updatedBy: 'operator' })))
    .onConflictDoNothing()

  await db
    .insert(pricingRules)
    .values(PRICING_SEED.map((p) => ({ ...p, shopId: shopRow.id, createdBy: 'operator' })))
    .onConflictDoNothing()

  const nicheRows = await db
    .insert(niches)
    .values(
      NICHE_SEED.map((n) => ({
        ...n,
        shopId: shopRow.id,
        status: 'approved' as const,
        createdBy: 'operator',
      })),
    )
    .onConflictDoNothing({ target: niches.name })
    .returning()

  const allNiches = nicheRows.length > 0 ? nicheRows : await db.query.niches.findMany()
  const nicheByName = new Map(allNiches.map((n) => [n.name, n.id]))

  await db
    .insert(concepts)
    .values(
      CONCEPT_SEED.map((c) => ({
        shopId: shopRow.id,
        nicheId: nicheByName.get(c.niche) ?? null,
        title: c.title,
        promptBrief: c.promptBrief,
        style: c.style,
        products: c.products,
        audience: NICHE_SEED.find((n) => n.name === c.niche)?.audience ?? null,
        whyNow: 'Christmas 2026 gift window',
        ipRisk: 'low' as const,
        status: 'proposed' as const,
        createdBy: 'operator',
      })),
    )
    .onConflictDoNothing()

  console.log(
    `seeded: 1 shop, ${NICHE_SEED.length} niches, ${CONCEPT_SEED.length} concepts, ` +
      `${BLOCKED_PHRASE_SEED.length} blocked phrases, ${PRICING_SEED.length} pricing rules`,
  )
}

const isEntrypoint = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isEntrypoint) {
  seed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('seed failed:', err)
      process.exit(1)
    })
}
