/**
 * Bring a fresh database up to a usable state.
 *
 * Runs at the composition root rather than in `packages/core/db`, because seeding
 * creates a division FROM a module and core must never import `modules/`.
 *
 * Idempotent: re-running it registers the modules again (an upsert) and skips a
 * division that already exists.
 *
 *   pnpm --filter @acf/web seed
 */

import { createDivision, registerModules } from '@acf/core/modules'
import { createDatabase, runMigrations, users } from '@acf/db'
import {
  POD_MIGRATIONS,
  blockedPhrases,
  concepts,
  niches,
  pricingRules,
} from '@acf/pod/schema'
import {
  agentStore,
  approvalRuleSeedStore,
  divisionStore,
  eventSink,
  moduleStore,
} from '@acf/jobs'

import { MODULES } from '../lib/modules'

const OPERATOR_EMAIL = process.env['OPERATOR_EMAIL'] ?? 'operator@example.com'
const DIVISION_SLUG = 'pod-store'

/**
 * Well-known registered marks that turn up on print-on-demand apparel. A starting
 * point the operator adds to, not legal advice and not a complete list.
 */
const BLOCKED_PHRASES = [
  { phrase: 'just do it', reason: 'Nike registered mark' },
  { phrase: 'i love new york', reason: 'New York State registered mark' },
  { phrase: 'super bowl', reason: 'NFL registered mark' },
  { phrase: 'march madness', reason: 'NCAA registered mark' },
  { phrase: 'olympic', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
  { phrase: 'olympics', reason: 'USOPC/IOC protected under the Ted Stevens Act' },
  { phrase: 'life is good', reason: 'Life is Good Inc registered apparel mark' },
  { phrase: 'the happiest place on earth', reason: 'Disney registered mark' },
  { phrase: "let's get ready to rumble", reason: 'Michael Buffer registered mark' },
  { phrase: 'world cup', reason: 'FIFA registered mark' },
]

const PRICING = [
  { productType: 'mug_11oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1499 },
  { productType: 'mug_15oz', markupMultiple: 2.4, roundToCents: 99, minPriceCents: 1799 },
  { productType: 'tee', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 2199 },
  { productType: 'sweatshirt', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 3499 },
  { productType: 'hoodie', markupMultiple: 2.2, roundToCents: 99, minPriceCents: 3999 },
]

const NICHES = [
  {
    name: 'Nurses and healthcare workers',
    keywords: ['nurse gift', 'nurse mug', 'rn gift', 'night shift nurse'],
    audience: 'Friends and family buying for a nurse at Christmas',
    season: 'christmas-2026',
    score: 78,
    rationale:
      'Large, loyal, gift-heavy audience with strong in-group humour. The buyer is usually not the nurse, so the joke has to read instantly from a thumbnail.',
  },
  {
    name: 'Dog people',
    keywords: ['dog mom gift', 'dog dad mug', 'rescue dog', 'dog lover christmas'],
    audience: 'Gift buyers for dog owners who treat the dog as family',
    season: 'christmas-2026',
    score: 81,
    rationale:
      'Perennially the strongest giftable niche on POD. Competition is heavy, so the win is specificity of voice rather than breadth.',
  },
  {
    name: 'Teachers',
    keywords: ['teacher gift', 'teacher mug', 'end of term gift'],
    audience: 'Parents and students buying an end-of-term or Christmas gift',
    season: 'christmas-2026',
    score: 72,
    rationale:
      'Predictable December spike with a low price ceiling. Mugs over apparel: the buyer is often a child with a small budget.',
  },
]

/**
 * Ten concepts, written by hand.
 *
 * The week-1 acceptance test is "10 hand-written concepts produce 30 designs the
 * operator picks from". Writing them by hand is the plan, not a shortcut: the Trend
 * scout is a week-4 agent and the first sixty concepts were always meant to be
 * written in an afternoon.
 */
const CONCEPTS: Array<{
  niche: string
  title: string
  promptBrief: string
  style: 'flat-vector' | 'hand-lettered' | 'retro-badge' | 'line-art' | 'watercolor'
  products: string[]
}> = [
  {
    niche: 'Nurses and healthcare workers',
    title: 'Powered by caffeine and chaos',
    promptBrief:
      'Bold hand-lettered phrase arranged around a simple coffee cup with a stethoscope looped through the handle. Warm, tired, affectionate. No faces, no logos.',
    style: 'hand-lettered',
    products: ['mug_11oz', 'mug_15oz', 'tee'],
  },
  {
    niche: 'Nurses and healthcare workers',
    title: 'Night shift survivor',
    promptBrief:
      'Retro badge roundel with a crescent moon, a coffee cup and a heartbeat line forming the border. Muted navy and cream, worn letterpress feel.',
    style: 'retro-badge',
    products: ['tee', 'sweatshirt', 'hoodie'],
  },
  {
    niche: 'Nurses and healthcare workers',
    title: 'Trust me, I check vitals for a living',
    promptBrief:
      'Clean flat-vector clipboard with a heartbeat line, phrase set in a confident sans-serif beneath. Teal and charcoal, lots of negative space so it reads as a thumbnail.',
    style: 'flat-vector',
    products: ['mug_11oz', 'tee'],
  },
  {
    niche: 'Dog people',
    title: 'Professional dog tired',
    promptBrief:
      'A sleepy cartoon dog slumped over a coffee cup, phrase hand-lettered above. Soft, rounded, friendly line work. A generic mixed-breed dog, not a recognisable mascot.',
    style: 'hand-lettered',
    products: ['mug_11oz', 'mug_15oz', 'sweatshirt'],
  },
  {
    niche: 'Dog people',
    title: 'My rescue rescued me',
    promptBrief:
      'Single-weight line-art drawing of a dog and a human profile facing each other, forming a heart in the negative space between them. Phrase small beneath in a quiet serif.',
    style: 'line-art',
    products: ['tee', 'sweatshirt', 'hoodie'],
  },
  {
    niche: 'Dog people',
    title: 'Walked. Fed. Still judged.',
    promptBrief:
      'Flat-vector dog sitting upright with a flatly unimpressed expression, phrase stacked in three lines beside it. Two colours plus background.',
    style: 'flat-vector',
    products: ['mug_11oz', 'tee'],
  },
  {
    niche: 'Dog people',
    title: 'Home is where the fur sticks',
    promptBrief:
      'Watercolour wash of a cosy armchair with a dog curled on it and fur tufts drifting in the air, phrase hand-lettered along the bottom. Autumnal and warm.',
    style: 'watercolor',
    products: ['mug_15oz', 'sweatshirt'],
  },
  {
    niche: 'Teachers',
    title: "Fuelled by coffee and other people's children",
    promptBrief:
      'Hand-lettered phrase stacked around a coffee cup with a pencil resting across the top. Chalkboard palette: off-white lettering on deep green.',
    style: 'hand-lettered',
    products: ['mug_11oz', 'mug_15oz'],
  },
  {
    niche: 'Teachers',
    title: 'Ask me about my 25 kids',
    promptBrief:
      'Retro badge with a schoolhouse silhouette and an apple, phrase curved around the top edge. Warm mustard and brick red, 1970s educational-poster feel.',
    style: 'retro-badge',
    products: ['tee', 'sweatshirt'],
  },
  {
    niche: 'Teachers',
    title: 'Technically a professional glitter wrangler',
    promptBrief:
      'Flat-vector scattered glitter specks, scissors and a glue stick arranged around the phrase. Bright and high-contrast so it survives being printed small.',
    style: 'flat-vector',
    products: ['mug_11oz', 'tee'],
  },
]

async function main() {
  console.log('applying migrations...')
  await runMigrations({ moduleMigrations: [POD_MIGRATIONS] })

  const db = createDatabase()

  await db.insert(users).values({ email: OPERATOR_EMAIL, role: 'owner' }).onConflictDoNothing()

  const deps = {
    modules: moduleStore(db),
    divisions: divisionStore(db),
    agents: agentStore(db),
    rules: approvalRuleSeedStore(db),
    events: eventSink(db),
  }

  console.log('registering modules...')
  await registerModules(MODULES, deps)

  const existing = await deps.divisions.findBySlug(DIVISION_SLUG)
  if (existing) {
    console.log(`division "${DIVISION_SLUG}" already exists; leaving it alone`)
    return
  }

  console.log('creating the POD division...')
  const { division, agents } = await createDivision(
    {
      name: 'Deadstock',
      slug: DIVISION_SLUG,
      moduleName: 'pod',
      activate: true,
      config: { productTypes: ['mug_11oz', 'mug_15oz', 'tee', 'sweatshirt', 'hoodie'] },
    },
    MODULES,
    deps,
  )

  await db
    .insert(blockedPhrases)
    .values(BLOCKED_PHRASES.map((p) => ({ ...p, divisionId: division.id, actor: 'operator' })))
    .onConflictDoNothing()

  await db
    .insert(pricingRules)
    .values(PRICING.map((p) => ({ ...p, divisionId: division.id, actor: 'operator' })))
    .onConflictDoNothing()

  const nicheRows = await db
    .insert(niches)
    .values(
      NICHES.map((n) => ({ ...n, divisionId: division.id, status: 'approved' as const, actor: 'operator' })),
    )
    .onConflictDoNothing()
    .returning()

  const nicheByName = new Map(nicheRows.map((n) => [n.name, n.id]))

  await db
    .insert(concepts)
    .values(
      CONCEPTS.map((c) => ({
        divisionId: division.id,
        nicheId: nicheByName.get(c.niche) ?? null,
        title: c.title,
        promptBrief: c.promptBrief,
        style: c.style,
        products: c.products,
        audience: NICHES.find((n) => n.name === c.niche)?.audience ?? null,
        whyNow: 'Christmas 2026 gift window',
        ipRisk: 'low' as const,
        status: 'approved' as const,
        actor: 'operator',
      })),
    )
    .onConflictDoNothing()

  console.log(
    `seeded: division "${division.name}" with ${agents.length} agents, ` +
      `${NICHES.length} niches, ${CONCEPTS.length} concepts, ${BLOCKED_PHRASES.length} blocked phrases`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('seed failed:', err)
    process.exit(1)
  })
