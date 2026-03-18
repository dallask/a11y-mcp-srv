import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

const { fixtureForMock } = vi.hoisted(() => {
  const path = require('path')
  const fs = require('fs')
  return {
    fixtureForMock: JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/audit-result.json'), 'utf-8')
    ),
  }
})
vi.mock('../../../src/tools/audit.js', () => ({
  auditUrl: vi.fn().mockResolvedValue(fixtureForMock),
}))
import { compareAccessibility, trackAccessibility } from '../../../src/tools/comparison.js'

describe('compareAccessibility', () => {
  it('compares two result objects and returns fixed, introduced, remaining', async () => {
    const before = { ...auditResultFixture, summary: { ...auditResultFixture.summary, score: 80 } }
    const after = { ...auditResultFixture, prioritizedIssues: [auditResultFixture.prioritizedIssues[0]], summary: { ...auditResultFixture.summary, totalIssues: 1, score: 90 } }
    const result = await compareAccessibility({ before, after })
    expect(result.issuesFixed).toBeDefined()
    expect(result.issuesIntroduced).toBeDefined()
    expect(result.remainingIssues).toBeDefined()
    expect(typeof result.scoreImprovement).toBe('number')
    expect(result.summary).toBeDefined()
    expect(result.format).toMatch(/summary|detailed|diff/)
  })

  it('returns summary format by default', async () => {
    const result = await compareAccessibility({
      before: auditResultFixture,
      after: auditResultFixture,
      format: 'summary',
    })
    expect(result.format).toBe('summary')
    expect(result.summary).toContain('Score')
  })

  it('returns detailed format when requested', async () => {
    const result = await compareAccessibility({
      before: auditResultFixture,
      after: auditResultFixture,
      format: 'detailed',
    })
    expect(result.format).toBe('detailed')
  })

  it('returns diff format with generateDiffSummary', async () => {
    const result = await compareAccessibility({
      before: auditResultFixture,
      after: { ...auditResultFixture, summary: { ...auditResultFixture.summary, score: 95 } },
      format: 'diff',
    })
    expect(result.format).toBe('diff')
    expect(result.summary).toBeDefined()
    expect(typeof result.summary).toBe('string')
  })
})

describe('trackAccessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns trend data after running audit (mocked auditUrl)', async () => {
    const result = await trackAccessibility({
      url: 'https://example.com',
      timeframe: '30d',
      metric: 'score',
    })
    expect(result.url).toBe('https://example.com')
    expect(result.currentValue).toBeDefined()
    expect(result.trend).toMatch(/improving|declining|stable/)
    expect(result.recommendations).toBeDefined()
    expect(Array.isArray(result.recommendations)).toBe(true)
  })

  it('supports metric issues and wcag-compliance', async () => {
    const scoreResult = await trackAccessibility({ url: 'https://example.com', metric: 'score' })
    expect(scoreResult.currentValue).toBe(auditResultFixture.summary.score)
    const issuesResult = await trackAccessibility({ url: 'https://example.com', metric: 'issues' })
    expect(issuesResult.currentValue).toBe(auditResultFixture.summary.totalIssues)
  })
})
