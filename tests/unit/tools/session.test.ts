import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TEST_SESSION_ID = 'test-session-id'

const { mockPage, mockContext, mockBrowser, sessions, rawFixture } = vi.hoisted(() => {
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
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  }
  const sessions = new Map<string, unknown>()
  return { mockPage, mockContext, mockBrowser, sessions, rawFixture }
})

vi.mock('../../../src/core/shared-browser.js', () => ({
  acquireSharedBrowser: vi.fn().mockResolvedValue(mockBrowser),
  shutdownSharedBrowser: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../src/core/accessibility-runner.js', () => ({
  AccessibilityRunner: class MockAccessibilityRunner {
    run = vi.fn().mockResolvedValue({
      accessibilityResults: rawFixture,
      responseStatus: 200,
    })
  },
}))

vi.mock('../../../src/core/session-manager.js', () => ({
  SessionManager: class MockSessionManager {
    createSession = vi.fn().mockImplementation(async (context: unknown, config: { domain: string }) => {
      sessions.set(TEST_SESSION_ID, context)
      return {
        sessionId: TEST_SESSION_ID,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        testUrl: config.domain.replace(/\/$/, '') + '/',
      }
    })
    validateSession = vi.fn().mockImplementation((id: string) => id === TEST_SESSION_ID)
    getContext = vi.fn().mockImplementation((id: string) => sessions.get(id))
    getSession = vi.fn().mockImplementation((id: string) =>
      sessions.has(id) ? { domain: 'https://example.com' } : null
    )
  },
}))

import { createSession, auditWithSession } from '../../../src/tools/session.js'

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessions.clear()
    mockBrowser.newContext.mockResolvedValue(mockContext)
  })

  it('returns sessionId, expiresAt, testUrl', async () => {
    const result = await createSession({
      domain: 'https://example.com',
      username: 'user',
      password: 'pass',
    })
    expect(result.sessionId).toBe(TEST_SESSION_ID)
    expect(result.expiresAt).toBeDefined()
    expect(result.testUrl).toBeDefined()
    expect(result.testUrl).toContain('example.com')
  })

  it('throws when domain is missing', async () => {
    await expect(
      createSession({ domain: '', username: 'u', password: 'p' })
    ).rejects.toThrow('Domain is required')
  })

  it('throws when username is missing', async () => {
    await expect(
      createSession({ domain: 'https://example.com', username: '', password: 'p' })
    ).rejects.toThrow('Username is required')
  })

  it('throws when password is missing', async () => {
    await expect(
      createSession({ domain: 'https://example.com', username: 'u', password: '' })
    ).rejects.toThrow('Password is required')
  })
})

describe('auditWithSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessions.clear()
    sessions.set(TEST_SESSION_ID, mockContext)
    mockContext.newPage.mockResolvedValue(mockPage)
  })

  it('returns AuditResult when session is valid', async () => {
    const result = await auditWithSession({
      sessionId: TEST_SESSION_ID,
      url: 'https://example.com/dashboard',
    })
    expect(result.summary).toBeDefined()
    expect(result.prioritizedIssues).toBeDefined()
    expect(result.conversationalSummary).toBeDefined()
  })

  it('throws when sessionId is missing', async () => {
    await expect(
      auditWithSession({ sessionId: '', url: 'https://example.com' })
    ).rejects.toThrow('Session ID is required')
  })

  it('throws when url is missing', async () => {
    await expect(
      auditWithSession({ sessionId: TEST_SESSION_ID, url: '' })
    ).rejects.toThrow('URL is required')
  })

  it('throws when session is not valid', async () => {
    sessions.clear()
    await expect(
      auditWithSession({ sessionId: 'invalid-id', url: 'https://example.com' })
    ).rejects.toThrow(/not valid|not found|Failed to get/)
  })
})
