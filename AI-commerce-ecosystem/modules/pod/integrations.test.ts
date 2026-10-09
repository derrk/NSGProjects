import { describe, expect, it } from 'vitest'

import {
  integrationMatrix,
  OWNER_SETUP_STEPS,
  readIntegrationEnv,
  type IntegrationEnv,
} from './integrations'

const find = (env: IntegrationEnv, key: string) =>
  integrationMatrix(env).find((i) => i.key === key)!

describe('integrationMatrix', () => {
  it('reports demo for everything when nothing is configured', () => {
    const matrix = integrationMatrix({})
    expect(matrix.every((i) => i.mode === 'demo' || i.mode === 'manual')).toBe(true)
    expect(matrix.some((i) => i.mode === 'live')).toBe(false)
  })

  it('reports live once a key is present', () => {
    expect(find({ anthropicKey: 'sk-ant-x' }, 'anthropic').mode).toBe('live')
    expect(find({ printifyToken: 't' }, 'printify').mode).toBe('live')
  })

  it('reports DEMO when mocks are forced, even with a real key present', () => {
    // Demo is what is running, so demo is what it must say. Reporting `live` here is
    // exactly how someone concludes a simulated order was a real one.
    expect(find({ anthropicKey: 'sk-ant-x', forceMocks: true }, 'anthropic').mode).toBe('demo')
    expect(find({ printifyToken: 't', forceMocks: true }, 'printify').mode).toBe('demo')
  })

  it('tells you exactly what to do to go live', () => {
    const printify = find({}, 'printify')
    expect(printify.toGoLive).toMatch(/PRINTIFY_API_TOKEN/)
    expect(printify.requires).toContain('PRINTIFY_API_TOKEN')
  })

  it('has nothing left to do once a service is live', () => {
    expect(find({ falKey: 'k' }, 'fal').toGoLive).toBeNull()
  })

  it('marks unbuilt channels as manual rather than demo', () => {
    // `demo` would imply a working simulation of publishing to Etsy. There isn't one.
    expect(find({ etsyToken: 'anything' }, 'etsy').mode).toBe('manual')
    expect(find({ shopifyToken: 'anything' }, 'shopify').mode).toBe('manual')
  })

  it('is honest that nothing has ever been emailed', () => {
    const email = find({ gmailRefreshToken: 'token' }, 'gmail')
    expect(email.mode).toBe('manual')
    expect(email.summary).toMatch(/no send path/)
  })

  it('does not claim semantic memory', () => {
    expect(find({}, 'embeddings').summary).toMatch(/not meaning/)
  })

  it('points at where the operator does a manual step themselves', () => {
    expect(find({}, 'etsy').deepLink).toMatch(/etsy\.com/)
  })
})

describe('readIntegrationEnv', () => {
  it('reads the env vars the matrix needs', () => {
    const env = readIntegrationEnv({
      ANTHROPIC_API_KEY: 'a',
      PRINTIFY_API_TOKEN: 'p',
      ACF_MOCK_INTEGRATIONS: '1',
    } as NodeJS.ProcessEnv)

    expect(env).toMatchObject({ anthropicKey: 'a', printifyToken: 'p', forceMocks: true })
  })

  it('treats any value other than 1 as not forcing mocks', () => {
    expect(
      readIntegrationEnv({ ACF_MOCK_INTEGRATIONS: 'true' } as NodeJS.ProcessEnv).forceMocks,
    ).toBe(false)
  })
})

describe('OWNER_SETUP_STEPS', () => {
  it('covers identity, banking, supplier choice and samples', () => {
    const keys = OWNER_SETUP_STEPS.map((s) => s.key)
    expect(keys).toContain('etsy.identity')
    expect(keys).toContain('supplier.approve')
    expect(keys).toContain('samples.order')
    expect(keys).toContain('tax')
  })

  it('explains why each step is the owner’s, not an agent’s', () => {
    expect(OWNER_SETUP_STEPS.every((s) => s.why.length > 20)).toBe(true)
  })

  it('never suggests storing identity or bank details here', () => {
    const identity = OWNER_SETUP_STEPS.find((s) => s.key === 'etsy.identity')!
    expect(identity.why).toMatch(/never stored here/)
  })
})
