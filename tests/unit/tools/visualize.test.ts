import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { generateDashboard, generateSummaryReport } from '../../../src/tools/visualize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/audit-result.json'), 'utf-8')
)

describe('generateDashboard', () => {
  it('returns dashboard string for result object', async () => {
    const result = await generateDashboard({
      results: auditResultFixture,
      format: 'markdown',
      includeCharts: true,
    })
    expect(result.dashboard).toBeDefined()
    expect(typeof result.dashboard).toBe('string')
    expect(result.format).toBe('markdown')
    expect(result.totalResults).toBe(1)
    expect(result.includeCharts).toBe(true)
  })

  it('supports text, html, json formats', async () => {
    const text = await generateDashboard({ results: auditResultFixture, format: 'text' })
    expect(text.format).toBe('text')
    const html = await generateDashboard({ results: auditResultFixture, format: 'html' })
    expect(html.format).toBe('html')
    expect(html.dashboard).toContain('<')
    const json = await generateDashboard({ results: auditResultFixture, format: 'json' })
    expect(json.format).toBe('json')
    expect(() => JSON.parse(json.dashboard)).not.toThrow()
  })

  it('accepts array of results', async () => {
    const result = await generateDashboard({
      results: [auditResultFixture, auditResultFixture],
      format: 'markdown',
    })
    expect(result.totalResults).toBe(2)
  })
})

describe('generateSummaryReport', () => {
  it('returns report string for result object', async () => {
    const result = await generateSummaryReport({
      results: auditResultFixture,
      format: 'markdown',
      level: 'executive',
    })
    expect(result.report).toBeDefined()
    expect(typeof result.report).toBe('string')
    expect(result.format).toBe('markdown')
    expect(result.level).toBe('executive')
    expect(result.totalResults).toBe(1)
  })

  it('supports detailed and technical levels', async () => {
    const detailed = await generateSummaryReport({
      results: auditResultFixture,
      level: 'detailed',
    })
    expect(detailed.level).toBe('detailed')
    const technical = await generateSummaryReport({
      results: auditResultFixture,
      level: 'technical',
    })
    expect(technical.level).toBe('technical')
  })

  it('supports text and html formats', async () => {
    const text = await generateSummaryReport({ results: auditResultFixture, format: 'text' })
    expect(text.format).toBe('text')
    const html = await generateSummaryReport({ results: auditResultFixture, format: 'html' })
    expect(html.format).toBe('html')
  })

  it('accepts array of results for summary report', async () => {
    const result = await generateSummaryReport({
      results: [auditResultFixture, auditResultFixture],
      format: 'markdown',
    })
    expect(result.totalResults).toBe(2)
  })
})
