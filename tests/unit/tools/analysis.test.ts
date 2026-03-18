import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  getAccessibilityScore,
  prioritizeIssues,
  explainIssue,
  getQuickFixes,
  generateComplianceReport,
  getWCAGCompliance,
} from '../../../src/tools/analysis.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

describe('getAccessibilityScore', () => {
  it('returns overallScore, breakdown, wcagCompliance for result object', async () => {
    const result = await getAccessibilityScore({ results: auditResultFixture })
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.overallScore).toBeLessThanOrEqual(100)
    expect(result.breakdown).toBeDefined()
    expect(typeof result.breakdown).toBe('object')
    expect(result.wcagCompliance).toMatchObject({
      A: expect.any(Number),
      AA: expect.any(Number),
      AAA: expect.any(Number),
    })
  })

  it('accepts custom weights', async () => {
    const result = await getAccessibilityScore({
      results: auditResultFixture,
      weights: { serious: 10, moderate: 2 },
    })
    expect(result.overallScore).toBeDefined()
  })
})

describe('prioritizeIssues', () => {
  it('returns prioritized list and reasoning', () => {
    const result = prioritizeIssues({
      results: auditResultFixture,
      criteria: 'impact',
    })
    expect(result.prioritized).toBeDefined()
    expect(Array.isArray(result.prioritized)).toBe(true)
    expect(result.reasoning).toBeDefined()
    expect(result.quickWins).toBeDefined()
    expect(result.criticalBlockers).toBeDefined()
  })

  it('respects limit', () => {
    const result = prioritizeIssues({
      results: auditResultFixture,
      criteria: 'impact',
      limit: 1,
    })
    expect(result.prioritized.length).toBeLessThanOrEqual(1)
  })

  it('supports criteria wcag, fixability, user-impact', () => {
    expect(prioritizeIssues({ results: auditResultFixture, criteria: 'wcag' }).prioritized.length).toBeGreaterThanOrEqual(0)
    expect(prioritizeIssues({ results: auditResultFixture, criteria: 'fixability' }).prioritized.length).toBeGreaterThanOrEqual(0)
    expect(prioritizeIssues({ results: auditResultFixture, criteria: 'user-impact' }).prioritized.length).toBeGreaterThanOrEqual(0)
  })
})

describe('explainIssue', () => {
  it('returns explanation for known ruleId', () => {
    const result = explainIssue({ ruleId: 'image-alt' })
    expect(result.ruleId).toBe('image-alt')
    expect(result.explanation).toBeDefined()
    expect(result.userImpact).toBeDefined()
    expect(result.howToFix).toBeDefined()
    expect(result.wcagReference).toBeDefined()
    expect(Array.isArray(result.commonMistakes)).toBe(true)
  })

  it('returns explanation with optional context', () => {
    const result = explainIssue({
      ruleId: 'color-contrast',
      context: 'Button text',
    })
    expect(result.ruleId).toBe('color-contrast')
    expect(result.explanation).toBeDefined()
  })
})

describe('getQuickFixes', () => {
  it('returns fixes for result object', async () => {
    const result = await getQuickFixes({
      results: auditResultFixture,
      format: 'json',
      includeCode: true,
    })
    expect(result.fixes).toBeDefined()
    expect(Array.isArray(result.fixes)).toBe(true)
    expect(result.format).toBe('json')
    expect(result.totalFixes).toBe(result.fixes.length)
  })

  it('returns markdown format when requested', async () => {
    const result = await getQuickFixes({
      results: auditResultFixture,
      format: 'markdown',
    })
    expect(result.formatted).toBeDefined()
    expect(typeof result.formatted).toBe('string')
  })

  it('returns html format when requested', async () => {
    const result = await getQuickFixes({
      results: auditResultFixture,
      format: 'html',
    })
    expect(result.formatted).toBeDefined()
    expect(result.formatted).toContain('<')
  })
})

describe('generateComplianceReport', () => {
  it('returns report with format, level, executiveSummary, wcagMapping', () => {
    const result = generateComplianceReport({
      results: auditResultFixture,
      format: 'WCAG',
      level: 'AA',
      includeRemediation: false,
    })
    expect(result.format).toBe('WCAG')
    expect(result.level).toBe('AA')
    expect(result.executiveSummary).toBeDefined()
    expect(result.wcagMapping).toBeDefined()
    expect(result.compliancePercentage).toBeDefined()
    expect(result.reportContent).toBeDefined()
  })

  it('supports VPAT, ADA, Section508 formats', () => {
    expect(generateComplianceReport({ results: auditResultFixture, format: 'VPAT' }).format).toBe('VPAT')
    expect(generateComplianceReport({ results: auditResultFixture, format: 'ADA' }).format).toBe('ADA')
    expect(generateComplianceReport({ results: auditResultFixture, format: 'Section508' }).format).toBe('Section508')
  })
})

describe('getWCAGCompliance', () => {
  it('returns compliance for result object', async () => {
    const result = await getWCAGCompliance({
      results: auditResultFixture,
      level: 'AA',
    })
    expect(result.level).toBe('AA')
    expect(result.status).toMatch(/pass|fail|partial/)
    expect(result.compliancePercentage).toBeDefined()
    expect(result.criteria).toBeDefined()
    expect(Array.isArray(result.criteria)).toBe(true)
    expect(result.summary).toBeDefined()
  })

  it('supports level A and AAA', async () => {
    const a = await getWCAGCompliance({ results: auditResultFixture, level: 'A' })
    expect(a.level).toBe('A')
    const aaa = await getWCAGCompliance({ results: auditResultFixture, level: 'AAA' })
    expect(aaa.level).toBe('AAA')
  })
})
