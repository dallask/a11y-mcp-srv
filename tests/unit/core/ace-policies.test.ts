import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveAcePolicies } from '../../../src/core/ace-policies.js'
import { __resetConfigCache, getAxeTagsFromConfig } from '../../../src/core/config.js'
import type { AccessibilityTag } from '../../../src/types/index.js'

describe('resolveAcePolicies', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    __resetConfigCache()
    ;['WCAG_LEVEL', 'BEST_PRACTICES'].forEach((k) => {
      saved[k] = process.env[k]
    })
  })

  afterEach(() => {
    ;['WCAG_LEVEL', 'BEST_PRACTICES'].forEach((k) => {
      if (saved[k] !== undefined) process.env[k] = saved[k]
      else delete process.env[k]
    })
    __resetConfigCache()
  })

  it('adds IBM_Accessibility when best-practice is in tags', () => {
    const p = resolveAcePolicies(['wcag22aa', 'best-practice'], true)
    expect(p).toContain('WCAG_2_2')
    expect(p).toContain('IBM_Accessibility')
    expect(p.length).toBe(2)
  })

  it('derives WCAG_2_1 from wcag21* when user provided tags', () => {
    expect(resolveAcePolicies(['wcag21aa'], true)).toEqual(['WCAG_2_1'])
  })

  it('uses env WCAG_LEVEL when userProvidedTags is false', () => {
    process.env.WCAG_LEVEL = '2.1_AA'
    __resetConfigCache()
    expect(resolveAcePolicies(['wcag22aa', 'wcag22a'], false)).toEqual(['WCAG_2_1'])
  })

  it('dedupes and sorts policy ids', () => {
    const p = resolveAcePolicies(['wcag22a', 'best-practice'], true)
    expect(p).toEqual(['IBM_Accessibility', 'WCAG_2_2'])
  })

  it('includes IBM_Accessibility when config tags include best-practice and userProvidedTags is false', () => {
    process.env.WCAG_LEVEL = '2.2_AA'
    process.env.BEST_PRACTICES = 'true'
    __resetConfigCache()
    const tags = getAxeTagsFromConfig() as AccessibilityTag[]
    const p = resolveAcePolicies(tags, false)
    expect(p).toContain('WCAG_2_2')
    expect(p).toContain('IBM_Accessibility')
  })
})
