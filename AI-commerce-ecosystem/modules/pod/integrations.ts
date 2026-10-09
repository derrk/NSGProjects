/**
 * What is actually connected, and what is pretending.
 *
 * The commerce brief asks for an integration matrix labelled live, demo or manual, and
 * asks that the UI never imply an account action succeeded without a real platform
 * result. This is the single place that answers "is this real?", so no screen has to
 * guess and no two screens can disagree.
 *
 * `manual` is a first-class answer, not a failure. Some things genuinely cannot be
 * automated — Etsy identity verification, bank details, accepting platform terms — and
 * a checklist with a deep link is the honest implementation, not a gap.
 */

export type IntegrationMode = 'live' | 'demo' | 'manual'

export interface IntegrationStatus {
  key: string
  label: string
  mode: IntegrationMode
  /** What works right now in this mode. */
  summary: string
  /** What the operator must do to move it to `live`. Null when already live. */
  toGoLive: string | null
  /** Env vars that switch it on. */
  requires: string[]
  /** For `manual`, where the operator does it themselves. */
  deepLink?: string
}

export interface IntegrationEnv {
  printifyToken?: string | undefined
  shopifyToken?: string | undefined
  shopifyDomain?: string | undefined
  etsyToken?: string | undefined
  falKey?: string | undefined
  anthropicKey?: string | undefined
  tavilyKey?: string | undefined
  gmailRefreshToken?: string | undefined
  forceMocks?: boolean | undefined
}

export function readIntegrationEnv(env: NodeJS.ProcessEnv = process.env): IntegrationEnv {
  return {
    printifyToken: env['PRINTIFY_API_TOKEN'],
    shopifyToken: env['SHOPIFY_ADMIN_ACCESS_TOKEN'],
    shopifyDomain: env['SHOPIFY_SHOP_DOMAIN'],
    etsyToken: env['ETSY_ACCESS_TOKEN'],
    falKey: env['FAL_KEY'],
    anthropicKey: env['ANTHROPIC_API_KEY'],
    tavilyKey: env['TAVILY_API_KEY'],
    gmailRefreshToken: env['GMAIL_REFRESH_TOKEN'],
    forceMocks: env['ACF_MOCK_INTEGRATIONS'] === '1',
  }
}

/**
 * The matrix.
 *
 * `forceMocks` overrides everything: running with offline stand-ins on while a real
 * token happens to be present must report `demo`, because demo is what is running.
 */
export function integrationMatrix(env: IntegrationEnv): IntegrationStatus[] {
  const live = (present: unknown): IntegrationMode =>
    env.forceMocks ? 'demo' : present ? 'live' : 'demo'

  return [
    {
      key: 'anthropic',
      label: 'Anthropic (agent reasoning)',
      mode: live(env.anthropicKey),
      summary: env.forceMocks
        ? 'Offline stand-in. Agents return canned, deterministic answers and spend nothing.'
        : env.anthropicKey
          ? 'Live. Agents call the model and the cost is metered onto each run.'
          : 'Offline stand-in. Set ANTHROPIC_API_KEY for real reasoning.',
      toGoLive: env.anthropicKey && !env.forceMocks ? null : 'Set ANTHROPIC_API_KEY.',
      requires: ['ANTHROPIC_API_KEY'],
    },
    {
      key: 'fal',
      label: 'fal.ai (image generation)',
      mode: live(env.falKey),
      summary: env.forceMocks || !env.falKey
        ? 'Offline stand-in. Returns a small valid PNG so the pipeline completes without spending.'
        : 'Live. Designs are generated and billed per image.',
      toGoLive: env.falKey && !env.forceMocks ? null : 'Set FAL_KEY.',
      requires: ['FAL_KEY'],
    },
    {
      key: 'printify',
      label: 'Printify (print on demand)',
      mode: live(env.printifyToken),
      summary:
        env.forceMocks || !env.printifyToken
          ? 'Offline stand-in. Models the real lock behaviour: publishing locks a product until a callback releases it.'
          : 'Live. Products are created and published in a real shop.',
      toGoLive:
        env.printifyToken && !env.forceMocks
          ? null
          : 'Create a Printify account, connect it to your store, then set PRINTIFY_API_TOKEN and the division’s printifyShopId.',
      requires: ['PRINTIFY_API_TOKEN'],
    },
    {
      key: 'shopify',
      label: 'Shopify (dropship storefront)',
      mode: 'manual',
      summary:
        'Not implemented. Listings are drafted and held; nothing reaches Shopify. ' +
        'The channel adapter is the next thing to build.',
      toGoLive:
        'Build the Shopify channel adapter, then create a custom app on your store and set ' +
        'SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.',
      requires: ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN'],
      deepLink: 'https://admin.shopify.com/settings/apps/development',
    },
    {
      key: 'etsy',
      label: 'Etsy (original + personalised POD)',
      mode: 'manual',
      summary:
        'Not implemented. Listings are drafted, checked against Etsy’s rules, and held. ' +
        'Opening the shop is yours to do regardless: identity, bank and tax details must go ' +
        'through Etsy’s own flow and are never stored here.',
      toGoLive:
        'Open the Etsy shop yourself, register an app for API access, then build the Etsy ' +
        'channel adapter and set ETSY_ACCESS_TOKEN.',
      requires: ['ETSY_ACCESS_TOKEN'],
      deepLink: 'https://www.etsy.com/sell',
    },
    {
      key: 'tavily',
      label: 'Tavily (web research)',
      mode: live(env.tavilyKey),
      summary:
        env.forceMocks || !env.tavilyKey
          ? 'Offline stand-in. Returns results marked SIMULATED that agents are told not to cite.'
          : 'Live. Agents search the web and cite real URLs with retrieval dates.',
      toGoLive: env.tavilyKey && !env.forceMocks ? null : 'Set TAVILY_API_KEY.',
      requires: ['TAVILY_API_KEY'],
    },
    {
      key: 'gmail',
      label: 'Email (customer support)',
      mode: 'manual',
      summary:
        'Drafts only, by design. send_email has no send path at all — it files the exact ' +
        'message for approval. Nothing has ever been sent from this system.',
      toGoLive:
        'Connect a support mailbox and implement sending, which should stay behind an ' +
        'approval until the category has earned autonomy.',
      requires: ['GMAIL_REFRESH_TOKEN'],
    },
    {
      key: 'embeddings',
      label: 'Embeddings (agent memory)',
      mode: 'demo',
      summary:
        'Local lexical vectoriser. Memory recall ranks by shared vocabulary, not meaning, ' +
        'and reports semantic: false so nothing mistakes it for semantic search.',
      toGoLive:
        'Add a real embedding provider, then run backfillMemoryEmbeddings — vectors from ' +
        'different models are not comparable.',
      requires: [],
    },
  ]
}

/** Owner-only steps. No agent can do these, and the system should not pretend otherwise. */
export interface OwnerSetupStep {
  key: string
  label: string
  why: string
  deepLink?: string
}

/**
 * What only the human can do.
 *
 * Identity, banking and tax go through the platform's own flow. Nothing here is stored
 * in this system, and nothing here can be automated — a checklist is the correct
 * implementation, not a placeholder for one.
 */
export const OWNER_SETUP_STEPS: OwnerSetupStep[] = [
  {
    key: 'etsy.open-shop',
    label: 'Open the Etsy shop',
    why: 'Shop name, currency and location. Etsy requires the owner to do this.',
    deepLink: 'https://www.etsy.com/sell',
  },
  {
    key: 'etsy.identity',
    label: 'Complete Etsy identity and bank details',
    why: 'Government ID and banking. Entered in Etsy’s flow and never stored here.',
    deepLink: 'https://www.etsy.com/your/shops/me/onboarding',
  },
  {
    key: 'etsy.production-partner',
    label: 'Register your production partner on Etsy',
    why: 'Etsy requires the partner who prints your items to be declared before listing.',
    deepLink: 'https://www.etsy.com/your/shops/me/tools/production-partners',
  },
  {
    key: 'shopify.store',
    label: 'Create the Shopify store and choose a plan',
    why: 'Billing and the payment provider are account-level and owner-only.',
    deepLink: 'https://www.shopify.com/signup',
  },
  {
    key: 'shopify.custom-app',
    label: 'Create a Shopify custom app and copy its Admin token',
    why: 'Grants this system least-privilege API access to your own store.',
    deepLink: 'https://admin.shopify.com/settings/apps/development',
  },
  {
    key: 'printify.connect',
    label: 'Connect Printify to the storefront',
    why: 'Links production to the shop and gives you the shop id this system needs.',
    deepLink: 'https://printify.com/app/account/api',
  },
  {
    key: 'supplier.approve',
    label: 'Choose and approve a dropship supplier',
    why: 'Who makes and ships your goods is a commitment, not something an agent earns.',
  },
  {
    key: 'samples.order',
    label: 'Order and inspect samples',
    why: 'Nothing goes live on a supplier nobody has held the output of.',
  },
  {
    key: 'tax',
    label: 'Settle sales tax and business registration',
    why: 'Jurisdiction-specific and legally yours. This system does not advise on it.',
  },
]
