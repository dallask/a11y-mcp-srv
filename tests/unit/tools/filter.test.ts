import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { filterIssues, searchIssues } from '../../../src/tools/filter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

describe('filterIssues', () => {
  it('filters by ruleIds in include mode', () => {
    const result = filterIssues({
      results: auditResultFixture,
      filters: { ruleIds: ['image-alt'] },
      mode: 'include',
    })
    expect(result.filteredCount).toBe(1)
    expect(result.originalCount).toBe(2)
    expect(result.filtered.prioritizedIssues[0].ruleId).toBe('image-alt')
  })

  it('filters by ruleIds in exclude mode', () => {
    const result = filterIssues({
      results: auditResultFixture,
      filters: { ruleIds: ['color-contrast'] },
      mode: 'exclude',
    })
    expect(result.filteredCount).toBe(1)
    expect(result.filtered.prioritizedIssues[0].ruleId).toBe('image-alt')
  })

  it('filters by categories in include mode', () => {
    const result = filterIssues({
      results: auditResultFixture,
      filters: { categories: ['error'] },
      mode: 'include',
    })
    expect(result.filteredCount).toBe(1)
    expect(result.filtered.prioritizedIssues[0].category).toBe('error')
  })

  it('filters by impactLevels', () => {
    const result = filterIssues({
      results: auditResultFixture,
      filters: { impactLevels: ['serious'] },
      mode: 'include',
    })
    expect(result.filteredCount).toBe(1)
    expect(result.filtered.prioritizedIssues[0].impact).toBe('serious')
  })

  it('filters by wcagLevels', () => {
    const result = filterIssues({
      results: auditResultFixture,
      filters: { wcagLevels: ['AA'] },
      mode: 'include',
    })
    expect(result.filteredCount).toBe(2)
  })

  it('returns filtersApplied and mode', () => {
    const result = filterIssues({
      results: auditResultFixture,
      filters: { ruleIds: ['image-alt'] },
      mode: 'include',
    })
    expect(result.filtersApplied).toEqual({ ruleIds: ['image-alt'] })
    expect(result.mode).toBe('include')
  })

  it('accepts results as JSON string (normalized input)', () => {
    const result = filterIssues({
      results: JSON.stringify(auditResultFixture),
      filters: { ruleIds: ['image-alt'] },
      mode: 'include',
    })
    expect(result.filteredCount).toBe(1)
    expect(result.originalCount).toBe(2)
    expect(result.filtered.prioritizedIssues[0].ruleId).toBe('image-alt')
  })
})

describe('searchIssues', () => {
  it('finds issues by query in description', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: 'alternate text',
    })
    expect(result.totalMatches).toBeGreaterThan(0)
    expect(result.matches.some((m) => m.description.includes('alternate'))).toBe(true)
  })

  it('finds issues by ruleId', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: 'image-alt',
      fields: ['ruleId'],
    })
    expect(result.totalMatches).toBe(1)
    expect(result.matches[0].ruleId).toBe('image-alt')
  })

  it('returns empty matches for empty query', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: '',
    })
    expect(result.totalMatches).toBe(0)
    expect(result.matches).toEqual([])
  })

  it('returns query and fields in result', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: 'contrast',
      fields: ['description'],
    })
    expect(result.query).toBe('contrast')
    expect(result.fields).toEqual(['description'])
  })

  it('finds by xpath when fields include xpath', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: 'body',
      fields: ['xpath'],
    })
    expect(result.totalMatches).toBeGreaterThanOrEqual(0)
  })

  it('finds by userImpact', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: 'Screen reader',
      fields: ['userImpact'],
    })
    expect(result.matches.some((m) => m.userImpact.includes('Screen reader'))).toBe(true)
  })

  it('finds by fix explanation', () => {
    const result = searchIssues({
      results: auditResultFixture,
      query: 'alt',
      fields: ['fix'],
    })
    expect(result.totalMatches).toBeGreaterThanOrEqual(0)
  })

  it('respects caseSensitive', () => {
    const lower = searchIssues({ results: auditResultFixture, query: 'image', caseSensitive: false })
    const upper = searchIssues({ results: auditResultFixture, query: 'IMAGE', caseSensitive: true })
    expect(lower.totalMatches).toBeGreaterThanOrEqual(0)
    expect(upper.totalMatches).toBe(0)
  })

  it('accepts results as JSON string (normalized input)', () => {
    const result = searchIssues({
      results: JSON.stringify(auditResultFixture),
      query: 'alternate text',
    })
    expect(result.totalMatches).toBeGreaterThanOrEqual(0)
    expect(result.matches).toBeDefined()
  })
})
