/**
 * Session Manager - Handles authenticated session storage and management
 * Manages session creation, validation, and cleanup for authenticated audits
 */

import { type BrowserContext, type Page } from 'playwright'
import type { Session, SessionConfig, SessionResult, LoginSelectors } from '../types/index.js'

/**
 * SessionManager class - Manages authenticated browser sessions
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map()
  private contexts: Map<string, BrowserContext> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly defaultSessionDuration = 60 * 60 * 1000 // 1 hour in milliseconds

  constructor() {
    // Start cleanup interval to remove expired sessions
    this.startCleanupInterval()
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions()
    }, 5 * 60 * 1000)
  }

  /**
   * Stop cleanup interval (useful for testing or shutdown)
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(domain: string, customId?: string): string {
    if (customId) {
      return `${domain}::${customId}`
    }
    return `${domain}::${Date.now()}::${Math.random().toString(36).substring(7)}`
  }

  /**
   * Get default login selectors
   */
  private getDefaultLoginSelectors(): LoginSelectors {
    return {
      usernameSelector: 'input[type="email"], input[name="username"], input[name="email"], input[id*="username"], input[id*="email"]',
      passwordSelector: 'input[type="password"]',
      submitSelector: 'button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")',
      successIndicator: 'body' // Default: any page load after submit indicates success
    }
  }

  /**
   * Perform login on a page
   */
  private async performLogin(
    page: Page,
    username: string,
    password: string,
    loginSelectors?: LoginSelectors
  ): Promise<void> {
    const selectors = { ...this.getDefaultLoginSelectors(), ...loginSelectors }

    try {
      // Wait for login form to be ready
      await page.waitForSelector(selectors.usernameSelector!, { timeout: 10000 })
      await page.waitForSelector(selectors.passwordSelector!, { timeout: 10000 })

      // Fill in credentials
      await page.fill(selectors.usernameSelector!, username)
      await page.fill(selectors.passwordSelector!, password)

      // Submit form
      await page.click(selectors.submitSelector!)

      // Wait for login to complete (either navigation or success indicator)
      if (selectors.successIndicator) {
        try {
          await page.waitForSelector(selectors.successIndicator, { timeout: 10000 })
        } catch {
          // If success indicator not found, wait for navigation
          await page.waitForLoadState('networkidle', { timeout: 10000 })
        }
      } else {
        await page.waitForLoadState('networkidle', { timeout: 10000 })
      }

      console.log('Login successful')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      // Provide more helpful error messages
      if (errorMessage.includes('timeout')) {
        throw new Error(
          `Login failed: Timeout waiting for login form. Please check the login selectors or increase timeout.`
        )
      } else if (errorMessage.includes('not found') || errorMessage.includes('selector')) {
        throw new Error(
          `Login failed: Could not find login form elements. Please verify the login selectors are correct.`
        )
      }
      throw new Error(`Login failed: ${errorMessage}`)
    }
  }

  /**
   * Create a new authenticated session
   */
  async createSession(
    context: BrowserContext,
    config: SessionConfig
  ): Promise<SessionResult> {
    const { domain, loginUrl, username, password, loginSelectors, sessionId: customSessionId } = config

    // Generate session ID
    const sessionId = this.generateSessionId(domain, customSessionId)

    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      const existingSession = this.sessions.get(sessionId)!
      if (existingSession.isActive && new Date(existingSession.expiresAt) > new Date()) {
        return {
          sessionId,
          expiresAt: existingSession.expiresAt,
          testUrl: existingSession.testUrl || domain,
        }
      }
    }

    try {
      // Create a new page for login
      const page = await context.newPage()

      // Determine login URL
      const loginPageUrl = loginUrl || `${domain}/login`

      // Navigate to login page
      console.log(`Navigating to login page: ${loginPageUrl}`)
      await page.goto(loginPageUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      })

      // Perform login
      await this.performLogin(page, username, password, loginSelectors)

      // Get test URL (current page after login)
      const testUrl = page.url()

      // Store browser context (contains cookies/auth state)
      this.contexts.set(sessionId, context)

      // Create session record
      const expiresAt = new Date(Date.now() + this.defaultSessionDuration).toISOString()
      const session: Session = {
        sessionId,
        domain,
        createdAt: new Date().toISOString(),
        expiresAt,
        testUrl,
        isActive: true,
      }

      this.sessions.set(sessionId, session)

      console.log(`Session created: ${sessionId} (expires: ${expiresAt})`)

      return {
        sessionId,
        expiresAt,
        testUrl,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      // Provide more context for session creation failures
      if (errorMessage.includes('Login failed')) {
        throw error // Re-throw login errors as-is (they already have context)
      }
      throw new Error(
        `Failed to create session: ${errorMessage}. Please check your credentials and login URL.`
      )
    }
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      this.invalidateSession(sessionId)
      return null
    }

    return session
  }

  /**
   * Get browser context for a session
   */
  getContext(sessionId: string): BrowserContext | null {
    const session = this.getSession(sessionId)
    if (!session) {
      return null
    }

    return this.contexts.get(sessionId) || null
  }

  /**
   * Validate that a session is active and valid
   */
  validateSession(sessionId: string): boolean {
    const session = this.getSession(sessionId)
    return session !== null && session.isActive
  }

  /**
   * Invalidate a session
   */
  invalidateSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.isActive = false
      this.sessions.delete(sessionId)
    }
    this.contexts.delete(sessionId)
    console.log(`Session invalidated: ${sessionId}`)
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      if (new Date(session.expiresAt) < now || !session.isActive) {
        expiredSessions.push(sessionId)
      }
    })

    expiredSessions.forEach((sessionId) => {
      this.invalidateSession(sessionId)
    })

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired session(s)`)
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    this.cleanupExpiredSessions()
    return Array.from(this.sessions.values()).filter((s) => s.isActive)
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    this.cleanupExpiredSessions()
    return this.sessions.size
  }

  /**
   * Clear all sessions (useful for testing or shutdown)
   */
  clearAllSessions(): void {
    this.sessions.clear()
    this.contexts.clear()
    console.log('All sessions cleared')
  }
}
