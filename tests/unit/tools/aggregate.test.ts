import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { aggregateAuditResults, getStatistics } from '../../../src/tools/aggregate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

describe('aggregateAuditResults', () => {
  it('aggregates multiple results with groupBy url', () => {
    const result = aggregateAuditResults({
      results: [auditResultFixture, auditResultFixture],
      groupBy: 'url',
      includeSummary: true,
    })
    expect(result.totalResults).toBe(2)
    expect(result.groupedBy).toBe('url')
    expect(result.aggregated.summary.totalIssues).toBe(4)
    expect(result.summary).toBeDefined()
    expect(result.aggregated.prioritizedIssues.length).toBe(4)
  })

  it('aggregates with groupBy category', () => {
    const result = aggregateAuditResults({
      results: [auditResultFixture],
      groupBy: 'category',
      includeSummary: true,
    })
    expect(result.groupedBy).toBe('category')
    expect(result.groupedIssues).toBeDefined()
    expect(result.aggregated.summary.byCategory).toBeDefined()
  })

  it('aggregates with groupBy rule', () => {
    const result = aggregateAuditResults({
      results: [auditResultFixture],
      groupBy: 'rule',
      includeSummary: true,
    })
    expect(result.groupedBy).toBe('rule')
    expect(result.aggregated.summary.byImpact).toBeDefined()
  })

  it('throws when results array is empty', () => {
    expect(() =>
      aggregateAuditResults({ results: [] })
    ).toThrow('At least one audit result is required')
  })

  it('aggregates with groupBy none', () => {
    const result = aggregateAuditResults({
      results: [auditResultFixture],
      groupBy: 'none',
      includeSummary: true,
    })
    expect(result.groupedBy).toBe('none')
    expect(result.aggregated.prioritizedIssues.length).toBe(2)
  })
})

describe('getStatistics', () => {
  it('returns statistics for single result', () => {
    const result = getStatistics({ results: auditResultFixture })
    expect(result.totalIssues).toBe(2)
    expect(result.totalResults).toBe(1)
    expect(result.averageScore).toBeGreaterThanOrEqual(0)
    expect(result.byCategory).toBeDefined()
    expect(result.byImpact).toBeDefined()
    expect(result.byWCAG).toBeDefined()
    expect(result.byRule).toBeDefined()
    expect(result.wcagCompliance).toMatchObject({
      A: expect.any(Number),
      AA: expect.any(Number),
      AAA: expect.any(Number),
    })
  })

  it('returns statistics for array of results', () => {
    const result = getStatistics({
      results: [auditResultFixture, auditResultFixture],
      breakdown: ['category', 'impact'],
    })
    expect(result.totalIssues).toBe(4)
    expect(result.totalResults).toBe(2)
    expect(result.byCategory).toBeDefined()
    expect(result.byImpact).toBeDefined()
    expect(result.breakdownDimensions).toContain('category')
    expect(result.breakdownDimensions).toContain('impact')
  })

  it('throws when results is empty', () => {
    expect(() => getStatistics({ results: [] })).toThrow('At least one audit result is required')
  })

  it('returns breakdown with single dimension', () => {
    const result = getStatistics({
      results: auditResultFixture,
      breakdown: ['rule'],
    })
    expect(result.byRule).toBeDefined()
    expect(result.byCategory).toBeUndefined()
    expect(result.breakdownDimensions).toEqual(['rule'])
  })
})
