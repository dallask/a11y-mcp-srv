import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { normalizeAuditResult } from '../../../src/core/normalize-audit-result.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

describe('normalizeAuditResult', () => {
  it('returns null for null', () => {
    expect(normalizeAuditResult(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizeAuditResult(undefined)).toBeNull()
  })

  it('returns null for URL string (http)', () => {
    expect(normalizeAuditResult('https://example.com')).toBeNull()
    expect(normalizeAuditResult('  https://example.com  ')).toBeNull()
  })

  it('returns null for URL string (https)', () => {
    expect(normalizeAuditResult('http://example.com')).toBeNull()
  })

  it('parses JSON string of audit result and normalizes', () => {
    const json = JSON.stringify(auditResultFixture)
    const result = normalizeAuditResult(json)
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(2)
    expect(result!.prioritizedIssues).toHaveLength(2)
    expect(result!.conversationalSummary).toBe(auditResultFixture.conversationalSummary)
  })

  it('returns null for malformed JSON string', () => {
    expect(normalizeAuditResult('{ invalid')).toBeNull()
    expect(normalizeAuditResult('not json at all')).toBeNull()
  })

  it('returns null for non-JSON non-URL string', () => {
    expect(normalizeAuditResult('hello')).toBeNull()
  })

  it('extracts and normalizes from MCP wrapper { content: [{ text }] }', () => {
    const wrapped = {
      content: [{ type: 'text', text: JSON.stringify(auditResultFixture) }],
    }
    const result = normalizeAuditResult(wrapped)
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(2)
  })

  it('returns null when MCP wrapper content text is invalid JSON', () => {
    const wrapped = { content: [{ type: 'text', text: '{' }] }
    expect(normalizeAuditResult(wrapped)).toBeNull()
  })

  it('normalizes batch result { results: [obj] } to first element', () => {
    const batch = { results: [auditResultFixture], other: true }
    const result = normalizeAuditResult(batch)
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(2)
  })

  it('normalizes plain object with summary and prioritizedIssues', () => {
    const result = normalizeAuditResult(auditResultFixture)
    expect(result).not.toBeNull()
    expect(result!.summary.score).toBe(85)
    expect(result!.prioritizedIssues).toHaveLength(2)
    expect(result!.quickWins).toHaveLength(1)
    expect(result!.criticalBlockers).toHaveLength(0)
  })

  it('fills missing fields with defaults for partial object', () => {
    const partial = { summary: { totalIssues: 1, score: 90 } }
    const result = normalizeAuditResult(partial)
    expect(result).not.toBeNull()
    expect(result!.prioritizedIssues).toEqual([])
    expect(result!.quickWins).toEqual([])
    expect(result!.criticalBlockers).toEqual([])
    expect(result!.conversationalSummary).toBe('')
    expect(result!.issuesTable).toBe('')
  })

  it('returns null for non-object non-string', () => {
    expect(normalizeAuditResult(42)).toBeNull()
    expect(normalizeAuditResult(true)).toBeNull()
  })

  it('normalizes empty object to minimal valid result (no summary or prioritizedIssues)', () => {
    const result = normalizeAuditResult({})
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(0)
    expect(result!.prioritizedIssues).toEqual([])
    expect(result!.conversationalSummary).toBe('')
  })

  it('unwraps { results: singleAuditObject } into same canonical shape', () => {
    const wrapped = { results: auditResultFixture, format: 'standard', includeMetadata: true }
    const result = normalizeAuditResult(wrapped)
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(2)
    expect(result!.prioritizedIssues).toHaveLength(2)
  })

  it('produces canonical metadata from top-level url/timestamp and ACE-style metadata', () => {
    const aceStyle = {
      url: 'https://example.com',
      timestamp: '2025-05-15T12:00:00.000Z',
      summary: { totalIssues: 1, score: 80, wcagCompliance: { A: 100, AA: 80, AAA: 60 }, byCategory: {}, byImpact: {} },
      prioritizedIssues: [],
      metadata: {
        testEngine: 'IBM Equal Access (ACE)',
        testDate: '2025-05-15T12:00:00.000Z',
        viewport: '1280x720',
      },
    }
    const result = normalizeAuditResult(aceStyle)
    expect(result).not.toBeNull()
    expect(result!.metadata).toBeDefined()
    expect(result!.metadata!.url).toBe('https://example.com')
    expect(result!.metadata!.timestamp).toBe('2025-05-15T12:00:00.000Z')
    expect(result!.metadata!.testEngine).toEqual({ name: 'IBM Equal Access (ACE)', version: '' })
    expect(result!.metadata!.testEnvironment.windowWidth).toBe(1280)
    expect(result!.metadata!.testEnvironment.windowHeight).toBe(720)
  })

  it('normalizes generate_dashboard-style payload (audit + format/includeCharts) with correct summary and url', () => {
    const dashboardPayload = {
      summary: {
        totalIssues: 18,
        score: 10,
        wcagCompliance: { A: 100, AA: 0, AAA: 100 },
        byCategory: { error: 18 },
        byImpact: { violation: 6, potentialviolation: 12 },
      },
      prioritizedIssues: [{ ruleId: 'aria_hidden_nontabbable', impact: 'violation' }],
      metadata: {
        testEngine: { name: 'IBM Equal Access', version: '4.x' },
        testRunner: { name: 'accessibility-checker' },
        testEnvironment: { userAgent: 'accessibility-checker', windowWidth: 1280, windowHeight: 720 },
        timestamp: '2026-03-18T10:37:05.088Z',
        url: 'https://voyacthcp69259main.dev.oapi.com/',
      },
      format: 'markdown',
      includeCharts: true,
    }
    const result = normalizeAuditResult(dashboardPayload)
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(18)
    expect(result!.summary.score).toBe(10)
    expect(result!.metadata?.url).toBe('https://voyacthcp69259main.dev.oapi.com/')
  })

  it('unwraps full request params { arguments: { results: audit } } when passed as results', () => {
    const audit = { summary: { totalIssues: 5, score: 50, wcagCompliance: { A: 0, AA: 0, AAA: 0 }, byCategory: {}, byImpact: {} }, prioritizedIssues: [] }
    const fullParams = { arguments: { results: audit, format: 'markdown', includeCharts: true } }
    const result = normalizeAuditResult(fullParams)
    expect(result).not.toBeNull()
    expect(result!.summary.totalIssues).toBe(5)
  })
})
