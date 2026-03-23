/**
 * Session management tools
 * Implements: create_session, audit_with_session
 */

import type { BrowserContext, Page } from 'playwright'
import { acquireSharedBrowser } from '../core/shared-browser.js'
import { SessionManager } from '../core/session-manager.js'
import { AccessibilityRunner } from '../core/accessibility-runner.js'
import { ResultProcessor, getWcagLabelFromTags } from '../core/result-processor.js'
import {
  retryWithBackoff,
  handleErrorGracefully,
  formatErrorMessage,
} from '../core/error-handler.js'
import { getConfig, getAxeTagsFromConfig } from '../core/config.js'
import { VALID_ACCESSIBILITY_TAGS } from '../core/accessibility-tags.js'
import type {
  SessionConfig,
  SessionResult,
  AuditWithSessionInput,
  AuditResult,
  WaitStrategy,
  AccessibilityTag,
} from '../types/index.js'

// Global session manager instance (singleton)
let sessionManager: SessionManager | null = null

/**
 * Get or create the global session manager instance
 */
function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager()
  }
  return sessionManager
}

/**
 * create_session - Create reusable authenticated session
 * 
 * Creates an authenticated browser session by logging into a website.
 * The session can be reused for multiple audits of protected pages.
 * 
 * @param config - Session configuration including domain, credentials, and optional login selectors
 * @returns Session information including sessionId, expiration time, and test URL
 */
export async function createSession(
  config: SessionConfig
): Promise<SessionResult> {
  const { domain, username, password } = config

  // Validate required fields
  if (!domain) {
    throw new Error('Domain is required')
  }
  if (!username) {
    throw new Error('Username is required')
  }
  if (!password) {
    throw new Error('Password is required')
  }

  // Normalize domain (ensure it has protocol)
  const normalizedDomain = domain.startsWith('http://') || domain.startsWith('https://')
    ? domain
    : `https://${domain}`

  let context: BrowserContext | null = null

  try {
    console.log(`Creating session (shared browser): ${normalizedDomain}`)
    const browser = await acquireSharedBrowser()

    // Create browser context (this will store cookies/auth state)
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    // Set extra HTTP headers
    await context.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    })

    // Get session manager
    const manager = getSessionManager()

    // Create session with normalized domain and retry logic
    const sessionConfig: SessionConfig = {
      ...config,
      domain: normalizedDomain,
    }

    const sessionResult = await retryWithBackoff(
      async () => {
        return await manager.createSession(context!, sessionConfig)
      },
      {
        maxRetries: 1, // Only retry once for session creation
        initialDelay: 2000,
      }
    )

    console.log(
      `Session created successfully: ${sessionResult.sessionId} (expires: ${sessionResult.expiresAt})`
    )

    // Note: We don't close the browser/context here because the session manager
    // needs to keep the context alive for future audits. The context will be
    // cleaned up when the session expires or is invalidated.

    return sessionResult
  } catch (error) {
    const errorInfo = handleErrorGracefully(
      error,
      `create_session: ${normalizedDomain}`
    )
    console.error(
      `Error creating session: ${formatErrorMessage(error, `create_session: ${normalizedDomain}`)}`
    )

    // Cleanup on error
    if (context) {
      await context.close().catch((err) => {
        console.warn(`Warning: Error closing context: ${err}`)
      })
    }

    throw new Error(errorInfo.error)
  }
}

/**
 * Normalize URL - handles relative URLs and adds domain if needed
 */
function normalizeUrl(url: string, domain?: string): string {
  // If URL is already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // If domain is provided, construct full URL
  if (domain) {
    const baseDomain = domain.replace(/\/$/, '') // Remove trailing slash
    const path = url.startsWith('/') ? url : `/${url}`
    return `${baseDomain}${path}`
  }

  // If no domain and URL is relative, throw error
  throw new Error(
    'URL must be absolute (start with http:// or https://) or domain must be provided for relative URLs'
  )
}

/**
 * audit_with_session - Run audit using existing authenticated session
 * 
 * Runs an accessibility audit on a URL using an existing authenticated session.
 * This allows testing protected pages without re-authenticating for each audit.
 * 
 * @param input - Audit configuration with session ID
 * @returns Structured audit results with prioritized issues, quick wins, and conversational summary
 */
export async function auditWithSession(
  input: AuditWithSessionInput
): Promise<AuditResult> {
  const {
    sessionId,
    url,
    domain,
    tags: inputTags,
    waitForLoad = 'load',
    timeout = 30,
    engine: inputEngine,
  } = input
  const appConfig = getConfig()

  // Validate required fields
  if (!sessionId) {
    throw new Error('Session ID is required')
  }
  if (!url) {
    throw new Error('URL is required')
  }

  // Get session manager
  const manager = getSessionManager()

  // Validate session exists and is active
  if (!manager.validateSession(sessionId)) {
    throw new Error(
      `Session ${sessionId} is not valid or has expired. Please create a new session.`
    )
  }

  // Get browser context from session
  const context = manager.getContext(sessionId)
  if (!context) {
    throw new Error(`Failed to get browser context for session ${sessionId}`)
  }

  // Get session info to determine domain if not provided
  const session = manager.getSession(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  // Use provided domain or fall back to session domain
  const auditDomain = domain || session.domain

  // Normalize URL
  const fullUrl = normalizeUrl(url, auditDomain)

  const userProvidedTags = Boolean(inputTags && inputTags.length > 0)
  const tags = userProvidedTags
    ? (inputTags as AccessibilityTag[])
    : (getAxeTagsFromConfig() as AccessibilityTag[])

  if (tags.length > 0) {
    const invalidTags = tags.filter(
      (tag) => !VALID_ACCESSIBILITY_TAGS.includes(tag as AccessibilityTag)
    )
    if (invalidTags.length > 0) {
      throw new Error(
        `Invalid tags: ${invalidTags.join(', ')}. Valid tags are: ${VALID_ACCESSIBILITY_TAGS.join(', ')}`
      )
    }
  }

  const engine = (inputEngine ?? appConfig.engine) as 'axe' | 'ace'

  let page: Page | null = null

  try {
    // Create a new page from the authenticated context
    // This page will have all the cookies and authentication state
    console.log(`Creating authenticated page for audit: ${fullUrl}`)
    page = await context.newPage()

    // Set extra HTTP headers (same as in createSession)
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    })

    // Initialize AccessibilityRunner
    const accessibilityRunner = new AccessibilityRunner()

    // Run accessibility test with default wait strategy and timeout
    // Using authenticated page context with retry logic
    console.log(`Running accessibility test on authenticated page: ${fullUrl}`)
    const accessibilityResult = await retryWithBackoff(
      async () => {
        return await accessibilityRunner.run(page!, {
          url: fullUrl,
          waitForLoad: waitForLoad as WaitStrategy,
          timeout: timeout * 1000,
          tags,
          engine,
          applyTagFilter: userProvidedTags,
        })
      },
      {
        maxRetries: 2,
        initialDelay: 2000,
      }
    )

    // Process results
    const resultProcessor = new ResultProcessor()

    // Use filtered results if tags were applied, otherwise use original
    const resultsToProcess =
      accessibilityResult.filteredResults || accessibilityResult.accessibilityResults

    const auditWcagLabel = getWcagLabelFromTags(tags as string[])
    const auditResult = resultProcessor.process(
      resultsToProcess,
      accessibilityResult.appliedFilters,
      { auditWcagLabel: auditWcagLabel !== 'N/A' ? auditWcagLabel : undefined }
    )

    console.log(
      `Authenticated audit complete: ${auditResult.summary.totalIssues} issues found, score: ${auditResult.summary.score}/100`
    )

    return auditResult
  } catch (error) {
    const errorInfo = handleErrorGracefully(
      error,
      `audit_with_session: ${fullUrl}`
    )
    console.error(
      `Error during authenticated audit: ${formatErrorMessage(error, `audit_with_session: ${fullUrl}`)}`
    )
    throw new Error(errorInfo.error)
  } finally {
    // Cleanup: close the page but keep the context alive for future audits
    if (page) {
      await page.close().catch((err) => {
        console.warn(`Warning: Error closing page: ${err}`)
      })
    }
  }
}

