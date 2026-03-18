import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  getWcagLabelFromTags,
  wcagLevelMatches,
  wcagLevelOrder,
  ResultProcessor,
} from '../../../src/core/result-processor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rawFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/raw-accessibility.json'), 'utf-8')
)

describe('getWcagLabelFromTags', () => {
  it('returns N/A for empty or missing tags', () => {
    expect(getWcagLabelFromTags([])).toBe('N/A')
    expect(getWcagLabelFromTags(undefined as unknown as string[])).toBe('N/A')
  })

  it('returns WCAG 2.0 level from tags', () => {
    expect(getWcagLabelFromTags(['wcag2a'])).toBe('WCAG 2.0 A')
    expect(getWcagLabelFromTags(['wcag2a', 'wcag2aa'])).toBe('WCAG 2.0 AA')
    expect(getWcagLabelFromTags(['wcag2a', 'wcag2aa', 'wcag2aaa'])).toBe('WCAG 2.0 AAA')
  })

  it('returns WCAG 2.1 level from tags', () => {
    expect(getWcagLabelFromTags(['wcag21a', 'wcag21aa'])).toBe('WCAG 2.1 AA')
  })

  it('returns WCAG 2.2 level from tags', () => {
    expect(getWcagLabelFromTags(['wcag22a', 'wcag22aa'])).toBe('WCAG 2.2 AA')
  })
})

describe('wcagLevelMatches', () => {
  it('matches A', () => {
    expect(wcagLevelMatches('A', 'A')).toBe(true)
    expect(wcagLevelMatches('WCAG 2.2 A', 'A')).toBe(true)
    expect(wcagLevelMatches('AA', 'A')).toBe(false)
    expect(wcagLevelMatches('WCAG 2.2 AA', 'A')).toBe(false)
  })

  it('matches AA', () => {
    expect(wcagLevelMatches('AA', 'AA')).toBe(true)
    expect(wcagLevelMatches('WCAG 2.2 AA', 'AA')).toBe(true)
    expect(wcagLevelMatches('AAA', 'AA')).toBe(false)
    expect(wcagLevelMatches('WCAG 2.2 AAA', 'AA')).toBe(false)
  })

  it('matches AAA', () => {
    expect(wcagLevelMatches('AAA', 'AAA')).toBe(true)
    expect(wcagLevelMatches('WCAG 2.2 AAA', 'AAA')).toBe(true)
  })
})

describe('wcagLevelOrder', () => {
  it('returns 3 for A, 2 for AA, 1 for AAA, 0 for unknown', () => {
    expect(wcagLevelOrder('A')).toBe(3)
    expect(wcagLevelOrder('WCAG 2.2 AA')).toBe(2)
    expect(wcagLevelOrder('WCAG 2.2 AAA')).toBe(1)
    expect(wcagLevelOrder('unknown')).toBe(0)
  })
})

describe('ResultProcessor', () => {
  it('processes raw AccessibilityResults into AuditResult', () => {
    const processor = new ResultProcessor()
    const result = processor.process(rawFixture)
    expect(result.summary).toBeDefined()
    expect(result.summary.totalIssues).toBe(1)
    expect(result.prioritizedIssues).toHaveLength(1)
    expect(result.prioritizedIssues[0].ruleId).toBe('image-alt')
    expect(result.prioritizedIssues[0].impact).toBe('serious')
    expect(result.quickWins).toBeDefined()
    expect(Array.isArray(result.criticalBlockers)).toBe(true)
    expect(result.conversationalSummary).toBeDefined()
    expect(typeof result.conversationalSummary).toBe('string')
    expect(result.issuesTable).toBeDefined()
    expect(result.metadata).toBeDefined()
    expect(result.metadata?.url).toBe(rawFixture.url)
    expect(result.rawResults).toBe(rawFixture)
  })

  it('includes appliedFilters and auditWcagLabel in output when provided', () => {
    const processor = new ResultProcessor()
    const result = processor.process(rawFixture, { tags: ['wcag2aa'] }, { auditWcagLabel: 'WCAG 2.2 AA' })
    expect(result.appliedFilters).toEqual({ tags: ['wcag2aa'] })
    expect(result.prioritizedIssues[0].wcagLevel).toBeDefined()
  })

  it('processes raw result with multiple impact types for conversational summary', () => {
    const multiImpactRaw = {
      ...rawFixture,
      violations: {
        error: {
          count: 2,
          items: {
            'rule-a': {
              count: 1,
              xpaths: ['/a'],
              impact: 'violation',
              tags: ['wcag2aa'],
              domInfo: [{ tagName: 'div', innerHTML: '<div>' }],
            },
            'rule-b': {
              count: 1,
              xpaths: ['/b'],
              impact: 'needs-review',
              tags: ['wcag2a'],
              domInfo: [{ tagName: 'span', innerHTML: '<span>' }],
            },
          },
        },
        contrast: {
          count: 1,
          items: {
            'rule-c': {
              count: 1,
              xpaths: ['/c'],
              impact: 'recommendation',
              tags: ['best-practice'],
              domInfo: [{ tagName: 'p', innerHTML: '<p>' }],
            },
          },
        },
      },
    }
    const processor = new ResultProcessor()
    const result = processor.process(multiImpactRaw)
    expect(result.conversationalSummary).toBeDefined()
    expect(result.conversationalSummary).toContain('Violations')
    expect(result.conversationalSummary).toMatch(/Needs review|Recommendations|Minor|WCAG Compliance/)
  })

  it('returns empty issues table when no issues', () => {
    const emptyViolations = {
      ...rawFixture,
      violations: { error: { count: 0, items: {} } },
    }
    const processor = new ResultProcessor()
    const result = processor.process(emptyViolations)
    expect(result.issuesTable).toContain('No issues found')
  })
})
