import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { mockPage, mockContext, mockBrowser, rawFixture } = vi.hoisted(() => {
  const rawFixture = {
    url: 'https://example.com',
    timestamp: new Date().toISOString(),
    testEngine: { name: 'axe-core', version: '4.11.0' },
    testRunner: { name: 'playwright' },
    testEnvironment: { userAgent: 'Mozilla/5.0', windowWidth: 1280, windowHeight: 720 },
    violations: {
      error: {
        count: 1,
        items: {
          'image-alt': {
            count: 1,
            xpaths: ['/html/body/img[1]'],
            description: 'Images must have alternate text',
            impact: 'serious',
            tags: ['wcag2aa'],
            domInfo: [{ tagName: 'img', id: 'hero', innerHTML: '<img id="hero">' }],
          },
        },
      },
    },
  }
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return { mockPage, mockContext, mockBrowser, rawFixture }
})

vi.mock('../../../src/core/playwright-bootstrap.js', () => ({
  launchChromium: vi.fn().mockResolvedValue(mockBrowser),
}))

vi.mock('../../../src/core/accessibility-runner.js', () => ({
  AccessibilityRunner: class MockAccessibilityRunner {
    run = vi.fn().mockResolvedValue({
      accessibilityResults: rawFixture,
      responseStatus: 200,
    })
  },
}))

import { auditUrl, auditMultipleUrls } from '../../../src/tools/audit.js'

describe('auditUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrowser.newPage.mockResolvedValue(mockPage)
    mockBrowser.newContext.mockResolvedValue(mockContext)
  })

  it('returns AuditResult shape with summary and prioritizedIssues', async () => {
    const result = await auditUrl({
      url: 'https://example.com',
    })
    expect(result.summary).toBeDefined()
    expect(result.summary.totalIssues).toBeDefined()
    expect(result.summary.score).toBeDefined()
    expect(result.prioritizedIssues).toBeDefined()
    expect(Array.isArray(result.prioritizedIssues)).toBe(true)
    expect(result.conversationalSummary).toBeDefined()
    expect(result.issuesTable).toBeDefined()
    expect(result.quickWins).toBeDefined()
    expect(result.criticalBlockers).toBeDefined()
  })

  it('normalizes relative URL with domain and returns result', async () => {
    const result = await auditUrl({
      url: '/path',
      domain: 'https://example.com',
    })
    expect(result.summary).toBeDefined()
    expect(result.prioritizedIssues).toBeDefined()
    // Runner mock receives config with full URL; audit completed successfully
    expect(result.summary.totalIssues).toBe(1)
  })

  it('throws when relative URL has no domain', async () => {
    await expect(
      auditUrl({ url: '/path' })
    ).rejects.toThrow(/domain must be provided/)
  })
})

describe('auditMultipleUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrowser.newPage.mockResolvedValue(mockPage)
    mockBrowser.newContext.mockResolvedValue(mockContext)
  })

  it('returns results and progress for multiple URLs', async () => {
    const progressUpdates: Array<{ current: number; total: number }> = []
    const result = await auditMultipleUrls(
      {
        urls: ['https://example.com/a', 'https://example.com/b'],
        parallel: 1,
        continueOnError: true,
      },
      (p) => progressUpdates.push({ current: p.current, total: p.total })
    )
    expect(result.results).toBeDefined()
    expect(Array.isArray(result.results)).toBe(true)
    expect(result.results.length).toBe(2)
    expect(progressUpdates.length).toBeGreaterThan(0)
  })

  it('accepts comma-separated URL string', async () => {
    const result = await auditMultipleUrls({
      urls: 'https://example.com/1,https://example.com/2',
      parallel: 1,
    })
    expect(result.results.length).toBe(2)
  })
})
