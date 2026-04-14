import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  exportToCsv,
  exportToExcel,
  exportToJson,
  exportToHtmlReport,
} from '../../../src/tools/export.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

describe('exportToCsv', () => {
  it('returns csv string with format and totalIssues', async () => {
    const result = await exportToCsv({
      results: auditResultFixture,
      includeMetadata: false,
      includeViolations: true,
      format: 'standard',
    })
    expect(result.csv).toBeDefined()
    expect(typeof result.csv).toBe('string')
    expect(result.format).toBe('standard')
    expect(result.totalIssues).toBe(2)
    expect(result.includeViolations).toBe(true)
    expect(result.filename).toBe('accessibility-audit.csv')
    expect(result.mimeType).toBe('text/csv; charset=utf-8')
  })

  it('includes Rule ID and Description in violation rows', async () => {
    const result = await exportToCsv({
      results: auditResultFixture,
      includeMetadata: false,
      includeViolations: true,
    })
    expect(result.csv).toContain('Rule ID')
    expect(result.csv).toContain('image-alt')
    expect(result.csv).toContain('color-contrast')
  })

  it('supports minimal and detailed formats', async () => {
    const minimal = await exportToCsv({ results: auditResultFixture, format: 'minimal' })
    expect(minimal.format).toBe('minimal')
    const detailed = await exportToCsv({ results: auditResultFixture, format: 'detailed' })
    expect(detailed.format).toBe('detailed')
  })

  it('includes metadata section when includeMetadata true and metadata present', async () => {
    const withMeta = {
      ...auditResultFixture,
      metadata: {
        testEngine: { name: 'axe', version: '4.0' },
        testRunner: { name: 'playwright' },
        testEnvironment: { userAgent: 'Mozilla/5.0', windowWidth: 1280, windowHeight: 720 },
        timestamp: '2026-01-01T00:00:00Z',
        url: 'https://example.com',
      },
    }
    const result = await exportToCsv({
      results: withMeta,
      includeMetadata: true,
      includeViolations: true,
    })
    expect(result.csv).toContain('Test Information')
    expect(result.csv).toContain('axe')
  })

  it('accepts results as JSON string (normalized via resolveAuditInput)', async () => {
    const result = await exportToCsv({
      results: JSON.stringify(auditResultFixture),
      includeMetadata: false,
      includeViolations: true,
    })
    expect(result.csv).toBeDefined()
    expect(result.totalIssues).toBe(2)
    expect(result.csv).toContain('image-alt')
  })
})

describe('exportToExcel', () => {
  it('returns base64 excel and metadata', async () => {
    const result = await exportToExcel({
      results: auditResultFixture,
      includeCharts: false,
      formatting: true,
    })
    expect(result.excel).toBeDefined()
    expect(typeof result.excel).toBe('string')
    expect(result.format).toBe('xlsx')
    expect(result.totalIssues).toBe(2)
    expect(Buffer.from(result.excel, 'base64').length).toBeGreaterThan(0)
    expect(result.filename).toBe('accessibility-audit.xlsx')
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  })

  it('derives filename from metadata URL hostname when present', async () => {
    const withMeta = {
      ...auditResultFixture,
      metadata: {
        testEngine: { name: 'axe', version: '4.0' },
        testRunner: { name: 'playwright' },
        url: 'https://www.example.com/page',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    }
    const result = await exportToExcel({ results: withMeta })
    expect(result.filename).toBe('www.example.com-accessibility-audit.xlsx')
  })
})

describe('exportToJson', () => {
  it('returns json string with summary and prioritizedIssues', async () => {
    const result = await exportToJson({
      results: auditResultFixture,
      pretty: true,
      includeRaw: false,
    })
    expect(result.json).toBeDefined()
    const parsed = JSON.parse(result.json)
    expect(parsed.summary).toBeDefined()
    expect(parsed.prioritizedIssues).toBeDefined()
    expect(parsed.prioritizedIssues.length).toBe(2)
    expect(result.pretty).toBe(true)
    expect(result.totalIssues).toBe(2)
    expect(result.filename).toBe('accessibility-audit.json')
    expect(result.mimeType).toBe('application/json; charset=utf-8')
  })

  it('supports includeRaw', async () => {
    const withRaw = await exportToJson({
      results: { ...auditResultFixture, rawResults: { url: 'https://example.com' } },
      includeRaw: true,
    })
    const parsed = JSON.parse(withRaw.json)
    expect(parsed.rawResults).toBeDefined()
  })
})

describe('exportToHtmlReport', () => {
  it('returns html string with key sections', async () => {
    const result = await exportToHtmlReport({
      results: auditResultFixture,
      template: 'default',
      includeCharts: true,
    })
    expect(result.html).toBeDefined()
    expect(result.html).toContain('<!DOCTYPE html')
    expect(result.html).toContain('</html>')
    expect(result.template).toBe('default')
    expect(result.totalIssues).toBe(2)
    expect(result.filename).toBe('accessibility-audit.html')
    expect(result.mimeType).toBe('text/html; charset=utf-8')
  })

  it('supports minimal and detailed templates', async () => {
    const minimal = await exportToHtmlReport({ results: auditResultFixture, template: 'minimal' })
    expect(minimal.template).toBe('minimal')
    const detailed = await exportToHtmlReport({ results: auditResultFixture, template: 'detailed' })
    expect(detailed.template).toBe('detailed')
  })
})
