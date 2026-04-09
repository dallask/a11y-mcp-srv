import { describe, it, expect } from 'vitest'
import { filterAceResultsByWcagLevel } from '../../../src/core/ace-wcag-level-filter.js'
import type { AccessibilityResults } from '../../../src/types/index.js'

function minimalRule(count: number) {
  return {
    count,
    xpaths: [''],
    description: 'x',
    domInfo: [],
    tags: [] as string[],
    impact: 'violation' as const,
  }
}

describe('filterAceResultsByWcagLevel', () => {
  const policies = ['WCAG_2_2'] as const

  it('keeps LEVEL_ONE rules for 2.2_A', () => {
    const input: AccessibilityResults = {
      url: 'https://example.com',
      timestamp: '',
      testEngine: { name: 'IBM Equal Access', version: '4' },
      testRunner: { name: 'x' },
      testEnvironment: { userAgent: '', windowWidth: 1280, windowHeight: 720 },
      violations: {
        error: {
          count: 2,
          items: {
            html_lang_exists: minimalRule(1),
            target_spacing_sufficient: minimalRule(1),
          },
        },
      },
    }
    const out = filterAceResultsByWcagLevel(input, '2.2_A', policies)
    expect(out.violations.error?.items.html_lang_exists).toBeDefined()
    expect(out.violations.error?.items.target_spacing_sufficient).toBeUndefined()
  })

  it('keeps LEVEL_THREE rules for 2.2_AAA', () => {
    const input: AccessibilityResults = {
      url: 'https://example.com',
      timestamp: '',
      testEngine: { name: 'IBM Equal Access', version: '4' },
      testRunner: { name: 'x' },
      testEnvironment: { userAgent: '', windowWidth: 1280, windowHeight: 720 },
      violations: {
        error: {
          count: 1,
          items: {
            target_spacing_sufficient: minimalRule(1),
          },
        },
      },
    }
    const out = filterAceResultsByWcagLevel(input, '2.2_AAA', policies)
    expect(out.violations.error?.items.target_spacing_sufficient).toBeDefined()
  })
})
