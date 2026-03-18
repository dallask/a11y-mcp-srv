import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getConfig,
  getAxeTagsFromConfig,
  getAcePolicyFromConfig,
  loadConfig,
  __resetConfigCache,
  type ServerConfig,
  type WcagLevel,
} from '../../../src/core/config.js'

describe('getConfig', () => {
  it('returns ServerConfig with engine, wcagLevel, includeBestPractices, screenSizes, headless', () => {
    const config = getConfig()
    expect(config).toMatchObject({
      engine: expect.stringMatching(/^axe|ace$/),
      wcagLevel: expect.any(String),
      includeBestPractices: expect.any(Boolean),
      screenSizes: expect.any(Array),
      headless: expect.any(Boolean),
    })
    expect(config.screenSizes.length).toBeGreaterThan(0)
    expect(config.screenSizes[0]).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      label: expect.any(String),
    })
  })

  it('returns valid WcagLevel', () => {
    const validLevels: WcagLevel[] = [
      '2.0_A', '2.0_AA', '2.0_AAA',
      '2.1_A', '2.1_AA', '2.1_AAA',
      '2.2_A', '2.2_AA', '2.2_AAA',
    ]
    const config = getConfig() as ServerConfig
    expect(validLevels).toContain(config.wcagLevel)
  })
})

describe('getAxeTagsFromConfig', () => {
  it('returns non-empty array of strings', () => {
    const tags = getAxeTagsFromConfig()
    expect(Array.isArray(tags)).toBe(true)
    expect(tags.length).toBeGreaterThan(0)
    tags.forEach((t) => expect(typeof t).toBe('string'))
  })

  it('returns tags that include wcag-related values', () => {
    const tags = getAxeTagsFromConfig()
    const hasWcag = tags.some((t) => /wcag\d/.test(t) || t === 'best-practice')
    expect(hasWcag).toBe(true)
  })
})

describe('getAcePolicyFromConfig', () => {
  it('returns non-empty string', () => {
    const policy = getAcePolicyFromConfig()
    expect(typeof policy).toBe('string')
    expect(policy.length).toBeGreaterThan(0)
  })

  it('returns a known ACE policy value', () => {
    const policy = getAcePolicyFromConfig()
    const known = ['WCAG_2_0', 'WCAG_2_1', 'WCAG_2_2']
    expect(known).toContain(policy)
  })
})

describe('loadConfig with env (parseWcagLevel / parseScreenSizes)', () => {
  const envKeys = ['WCAG_LEVEL', 'SCREEN_SIZES', 'BEST_PRACTICES', 'A11Y_ENGINE'] as const
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    __resetConfigCache()
    envKeys.forEach((k) => {
      savedEnv[k] = process.env[k]
    })
  })

  afterEach(() => {
    envKeys.forEach((k) => {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k]
      else delete process.env[k]
    })
    __resetConfigCache()
  })

  it('uses WCAG_LEVEL env and parses 2.0_AA', () => {
    process.env.WCAG_LEVEL = '2.0_AA'
    const config = loadConfig()
    expect(config.wcagLevel).toBe('2.0_AA')
  })

  it('uses WCAG_LEVEL with flexible format (2.2 AA)', () => {
    process.env.WCAG_LEVEL = '2.2 AA'
    const config = loadConfig()
    expect(config.wcagLevel).toBe('2.2_AA')
  })

  it('falls back to default for invalid WCAG_LEVEL', () => {
    process.env.WCAG_LEVEL = 'invalid'
    const config = loadConfig()
    expect(['2.0_AA', '2.1_AA', '2.2_AA']).toContain(config.wcagLevel)
  })

  it('uses SCREEN_SIZES env', () => {
    process.env.SCREEN_SIZES = '800x600,1920x1080'
    const config = loadConfig()
    expect(config.screenSizes.length).toBe(2)
    expect(config.screenSizes[0]).toMatchObject({ width: 800, height: 600, label: '800x600' })
    expect(config.screenSizes[1]).toMatchObject({ width: 1920, height: 1080, label: '1920x1080' })
  })

  it('ignores invalid screen size format', () => {
    process.env.SCREEN_SIZES = 'invalid,400x300'
    const config = loadConfig()
    expect(config.screenSizes.some((s) => s.label === '400x300')).toBe(true)
  })

  it('uses BEST_PRACTICES=false', () => {
    process.env.BEST_PRACTICES = 'false'
    const config = loadConfig()
    expect(config.includeBestPractices).toBe(false)
  })

  it('uses A11Y_ENGINE=axe', () => {
    process.env.A11Y_ENGINE = 'axe'
    const config = loadConfig()
    expect(config.engine).toBe('axe')
  })
})
