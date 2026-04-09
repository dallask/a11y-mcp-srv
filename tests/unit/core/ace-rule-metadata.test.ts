import { describe, it, expect } from 'vitest'
import { getAceRuleMeta, loadAceRuleMetadata } from '../../../src/core/ace-rule-metadata.js'

describe('ace-rule-metadata', () => {
  it('loads generated metadata', () => {
    const data = loadAceRuleMetadata()
    expect(data.engineVersion).toBeTruthy()
    expect(data.byPolicy.WCAG_2_2).toBeDefined()
    expect(Object.keys(data.byPolicy.WCAG_2_2).length).toBeGreaterThan(50)
  })

  it('resolves html_lang_exists under WCAG_2_2', () => {
    const meta = getAceRuleMeta('html_lang_exists', ['WCAG_2_2'])
    expect(meta?.toolkitLevel).toBe('LEVEL_ONE')
    expect(meta?.tags).toContain('wcag22a')
  })

  it('resolves target_spacing_sufficient as LEVEL_THREE', () => {
    const meta = getAceRuleMeta('target_spacing_sufficient', ['WCAG_2_2'])
    expect(meta?.toolkitLevel).toBe('LEVEL_THREE')
    expect(meta?.tags).toContain('wcag22aaa')
  })
})
