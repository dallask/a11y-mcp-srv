/**
 * Core audit tools
 * Implements: audit_url, audit_multiple_urls, audit_site
 */

import type { Browser, BrowserContext, Page } from 'playwright'
import { acquireSharedBrowser } from '../core/shared-browser.js'
import { AccessibilityRunner } from '../core/accessibility-runner.js'
import { ResultProcessor, getWcagLabelFromTags } from '../core/result-processor.js'
import {
  retryWithBackoff,
  handleErrorGracefully,
  formatErrorMessage,
} from '../core/error-handler.js'
import { getConfig, getAxeTagsFromConfig } from '../core/config.js'
import { parseUrlCredentials, getBasicAuthHeader } from '../core/basic-auth.js'
import type {
  AuditUrlInput,
  AuditResult,
  WaitStrategy,
  AccessibilityTag,
  AuditMultipleUrlsInput,
  BatchAuditProgress,
} from '../types/index.js'

/**
 * Debug logger that writes to stderr to avoid interfering with MCP protocol
 */
function debugLog(...args: any[]) {
  console.error(...args)
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
 * audit_url - Single URL audit with tag filtering support
 * 
 * Tests a single URL for accessibility issues and returns structured,
 * conversational results with prioritized issues and fix suggestions.
 * 
 * @param input - Audit configuration
 * @returns Structured audit results with prioritized issues, quick wins, and conversational summary
 */
const VALID_TAGS: AccessibilityTag[] = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag21aaa',
  'wcag22a',
  'wcag22aa',
  'wcag22aaa',
  'best-practice',
]

/** Resolved inputs for one audit run (shared browser; new context/page per call). */
interface SingleAuditParams {
  fullUrl: string
  basicAuthUsername?: string
  basicAuthPassword?: string
  tags: AccessibilityTag[]
  userProvidedTags: boolean
  waitForLoad: WaitStrategy
  timeout: number
  engine: 'axe' | 'ace'
}

/**
 * Run one audit using an existing Browser (shared). Closes only page/context, never the browser.
 */
async function runSingleUrlAudit(
  browser: Browser,
  params: SingleAuditParams
): Promise<AuditResult> {
  const config = getConfig()
  const {
    fullUrl,
    basicAuthUsername,
    basicAuthPassword,
    tags,
    userProvidedTags,
    waitForLoad,
    timeout,
    engine,
  } = params

  let context: BrowserContext | null = null
  let page: Page | null = null

  const userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  const basicAuthHeader = getBasicAuthHeader(basicAuthUsername, basicAuthPassword)
  if (basicAuthHeader) debugLog('Using HTTP Basic Authentication')

  try {
    debugLog(`Running audit: ${fullUrl}`)

    // Context extraHTTPHeaders apply to all requests (including navigation); no route / about:blank needed.
    if (basicAuthHeader) {
      context = await browser.newContext({
        userAgent,
        extraHTTPHeaders: {
          Authorization: basicAuthHeader,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      page = await context.newPage()
    } else {
      page = await browser.newPage({ userAgent })
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    }

    const viewport = config.screenSizes[0]
    if (viewport) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
    }

    const accessibilityRunner = new AccessibilityRunner()

    debugLog(`Running accessibility test on: ${fullUrl}`)
    if (page === null) {
      throw new Error('Failed to create browser page')
    }
    const auditPage: Page = page
    const accessibilityResult = await retryWithBackoff(
      async () =>
        accessibilityRunner.run(auditPage, {
          url: fullUrl,
          waitForLoad,
          timeout: timeout * 1000,
          tags,
          engine,
          applyTagFilter: userProvidedTags,
        }),
      {
        maxRetries: 2,
        initialDelay: 2000,
      }
    )

    const responseStatus = accessibilityResult.responseStatus
    const usedBasicAuth = basicAuthUsername != null && basicAuthPassword != null
    if (
      usedBasicAuth &&
      responseStatus != null &&
      (responseStatus === 401 || responseStatus === 403)
    ) {
      throw new Error(
        `HTTP ${responseStatus}: Basic Auth failed. The server rejected the credentials (or did not accept Basic Auth). Check username and password.`
      )
    }

    const resultProcessor = new ResultProcessor()
    const resultsToProcess =
      accessibilityResult.filteredResults || accessibilityResult.accessibilityResults

    const auditWcagLabel = getWcagLabelFromTags(tags as string[])
    const auditResult = resultProcessor.process(
      resultsToProcess,
      accessibilityResult.appliedFilters,
      { auditWcagLabel: auditWcagLabel !== 'N/A' ? auditWcagLabel : undefined }
    )

    debugLog(
      `Audit complete: ${auditResult.summary.totalIssues} issues found, score: ${auditResult.summary.score}/100`
    )

    return {
      ...auditResult,
      ...(responseStatus != null && { responseStatus }),
    }
  } catch (error) {
    const errorInfo = handleErrorGracefully(error, `audit_url: ${fullUrl}`)
    console.error(`Error during audit: ${formatErrorMessage(error, `audit_url: ${fullUrl}`)}`)
    throw new Error(errorInfo.error)
  } finally {
    if (page) {
      await page.close().catch((err) => {
        console.warn(`Warning: Error closing page: ${err}`)
      })
    }
    if (context) {
      await context.close().catch((err) => {
        console.warn(`Warning: Error closing context: ${err}`)
      })
    }
  }
}

export async function auditUrl(input: AuditUrlInput): Promise<AuditResult> {
  const config = getConfig()
  const {
    url,
    domain,
    tags: inputTags,
    waitForLoad = 'load',
    timeout = 30,
    engine: inputEngine,
    basicAuthUsername: inputBasicUser,
    basicAuthPassword: inputBasicPass,
  } = input

  const fullUrlRaw = normalizeUrl(url, domain)
  const parsedFromUrl = parseUrlCredentials(fullUrlRaw)
  const fullUrl = parsedFromUrl.urlWithoutAuth
  const basicAuthUsername = inputBasicUser ?? parsedFromUrl.username
  const basicAuthPassword = inputBasicPass ?? parsedFromUrl.password

  const engine = (inputEngine ?? config.engine) as 'axe' | 'ace'

  const userProvidedTags = Boolean(inputTags && inputTags.length > 0)
  const tags = userProvidedTags
    ? (inputTags as AccessibilityTag[])
    : (getAxeTagsFromConfig() as AccessibilityTag[])

  if (tags && tags.length > 0) {
    const invalidTags = tags.filter(
      (tag) => !VALID_TAGS.includes(tag as AccessibilityTag)
    )
    if (invalidTags.length > 0) {
      throw new Error(
        `Invalid tags: ${invalidTags.join(', ')}. Valid tags are: ${VALID_TAGS.join(', ')}`
      )
    }
  }

  const params: SingleAuditParams = {
    fullUrl,
    basicAuthUsername,
    basicAuthPassword,
    tags,
    userProvidedTags,
    waitForLoad: waitForLoad as WaitStrategy,
    timeout,
    engine,
  }

  const browser = await acquireSharedBrowser()
  return await runSingleUrlAudit(browser, params)
}

/**
 * Process a single URL in a batch audit with error handling
 */
async function processSingleUrl(
  url: string,
  domain: string | undefined,
  tags: string[] | undefined,
  continueOnError: boolean = true,
  engine?: 'axe' | 'ace',
  basicAuthUsername?: string,
  basicAuthPassword?: string
): Promise<{ url: string; result?: AuditResult; error?: string }> {
  try {
    const result = await retryWithBackoff(
      async () => {
        return await auditUrl({
          url,
          domain,
          tags,
          engine,
          basicAuthUsername,
          basicAuthPassword,
        })
      },
      {
        maxRetries: 1, // Single retry for batch operations
        initialDelay: 1000,
      }
    )
    return { url, result }
  } catch (error) {
    const errorInfo = handleErrorGracefully(error, `Batch audit: ${url}`)
    const errorMessage = formatErrorMessage(error, `Batch audit: ${url}`)
    
    // If error is not retryable and continueOnError is false, throw
    if (!errorInfo.retryable && !continueOnError) {
      throw error
    }
    
    return { url, error: errorMessage }
  }
}

/**
 * Process URLs in parallel batches
 */
async function processBatchParallel(
  urlArray: string[],
  domain: string | undefined,
  tags: string[] | undefined,
  parallel: number,
  continueOnError: boolean,
  onProgress?: (progress: BatchAuditProgress) => void,
  engine?: 'axe' | 'ace',
  basicAuthUsername?: string,
  basicAuthPassword?: string
): Promise<Array<{ url: string; result?: AuditResult; error?: string }>> {
  const results: Array<{ url: string; result?: AuditResult; error?: string }> =
    new Array(urlArray.length)
  const completedUrls: string[] = []
  const failedUrls: string[] = []
  const startTime = Date.now()
  let finishedCount = 0
  let nextIndex = 0

  const emitProgress = (currentUrl: string) => {
    const completed = finishedCount
    const percentage = Math.round((completed / urlArray.length) * 100)
    const elapsed = (Date.now() - startTime) / 1000
    const avgTimePerUrl = completed > 0 ? elapsed / completed : 0
    const remaining = urlArray.length - completed
    const estimatedTimeRemaining = Math.round(avgTimePerUrl * remaining)

    if (onProgress) {
      onProgress({
        current: completed,
        total: urlArray.length,
        percentage,
        status: `Parallel pool: ${completed}/${urlArray.length} URLs completed`,
        estimatedTimeRemaining,
        currentItem: currentUrl,
        completedUrls: [...completedUrls],
        failedUrls: [...failedUrls],
        currentUrl,
      })
    }
    debugLog(
      `Progress: ${completed}/${urlArray.length} (${percentage}%) - Completed: ${completedUrls.length}, Failed: ${failedUrls.length}`
    )
  }

  const worker = async () => {
    while (true) {
      const i = nextIndex++
      if (i >= urlArray.length) return
      const url = urlArray[i]
      let outcome: { url: string; result?: AuditResult; error?: string }

      try {
        outcome = await processSingleUrl(
          url,
          domain,
          tags,
          continueOnError,
          engine,
          basicAuthUsername,
          basicAuthPassword
        )
      } catch (e) {
        const errorInfo = handleErrorGracefully(e, `Batch audit: ${url}`)
        const errorMessage = formatErrorMessage(e, `Batch audit: ${url}`)
        outcome = { url, error: errorMessage }
        failedUrls.push(url)
        results[i] = outcome
        finishedCount++
        emitProgress(url)
        if (!continueOnError && !errorInfo.retryable) {
          throw new Error(`Audit failed for ${url}: ${errorMessage}`)
        }
        continue
      }

      results[i] = outcome
      if (outcome.result) {
        completedUrls.push(url)
      } else if (outcome.error) {
        failedUrls.push(url)
        if (!continueOnError) {
          const errorInfo = handleErrorGracefully(
            new Error(outcome.error),
            `Batch audit: ${url}`
          )
          if (!errorInfo.retryable) {
            finishedCount++
            emitProgress(url)
            throw new Error(`Audit failed for ${url}: ${outcome.error}`)
          }
        }
      }

      finishedCount++
      emitProgress(url)
    }
  }

  const workers = Math.min(Math.max(1, parallel), urlArray.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))

  return results
}

/**
 * Process URLs sequentially
 */
async function processBatchSequential(
  urlArray: string[],
  domain: string | undefined,
  tags: string[] | undefined,
  continueOnError: boolean,
  onProgress?: (progress: BatchAuditProgress) => void,
  engine?: 'axe' | 'ace',
  basicAuthUsername?: string,
  basicAuthPassword?: string
): Promise<Array<{ url: string; result?: AuditResult; error?: string }>> {
  const results: Array<{ url: string; result?: AuditResult; error?: string }> =
    []
  const completedUrls: string[] = []
  const failedUrls: string[] = []
  const startTime = Date.now()

  for (let i = 0; i < urlArray.length; i++) {
    const url = urlArray[i]
    const result = await processSingleUrl(url, domain, tags, continueOnError, engine, basicAuthUsername, basicAuthPassword)
    results.push(result)

    if (result.result) {
      completedUrls.push(url)
    } else if (result.error) {
      failedUrls.push(url)
      // Only throw if continueOnError is false and it's a critical error
      if (!continueOnError) {
        const errorInfo = handleErrorGracefully(
          new Error(result.error),
          `Sequential batch audit: ${url}`
        )
        // Only throw if it's not a transient error
        if (!errorInfo.retryable) {
          throw new Error(`Audit failed for ${url}: ${result.error}`)
        }
      }
    }

    // Calculate progress
    const completed = results.length
    const percentage = Math.round((completed / urlArray.length) * 100)
    const elapsed = (Date.now() - startTime) / 1000 // seconds
    const avgTimePerUrl = elapsed / completed
    const remaining = urlArray.length - completed
    const estimatedTimeRemaining = Math.round(avgTimePerUrl * remaining)

    // Send progress update
    if (onProgress) {
      onProgress({
        current: completed,
        total: urlArray.length,
        percentage,
        status: `Processing URL ${completed} of ${urlArray.length}`,
        estimatedTimeRemaining,
        currentItem: url,
        completedUrls: [...completedUrls],
        failedUrls: [...failedUrls],
        currentUrl: url,
      })
    }

    // Log progress
    debugLog(
      `Progress: ${completed}/${urlArray.length} (${percentage}%) - ${url}`
    )
  }

  return results
}

/**
 * Calculate aggregated summary from multiple audit results
 */
function calculateAggregatedSummary(
  results: Array<{ url: string; result?: AuditResult; error?: string }>
): {
  totalIssues: number
  averageScore: number
  totalUrls: number
  successful: number
  failed: number
  byCategory: Record<string, number>
  byImpact: Record<string, number>
  wcagCompliance: { A: number; AA: number; AAA: number }
} {
  const successful = results.filter((r) => r.result).length
  const failed = results.filter((r) => r.error).length
  const successfulResults = results
    .filter((r) => r.result)
    .map((r) => r.result!) as AuditResult[]

  // Aggregate statistics
  let totalIssues = 0
  let totalScore = 0
  const byCategory: Record<string, number> = {}
  const byImpact: Record<string, number> = {}
  const wcagCompliance = { A: 0, AA: 0, AAA: 0 }

  for (const result of successfulResults) {
    totalIssues += result.summary.totalIssues
    totalScore += result.summary.score

    // Aggregate by category
    for (const [category, count] of Object.entries(result.summary.byCategory)) {
      byCategory[category] = (byCategory[category] || 0) + count
    }

    // Aggregate by impact
    for (const [impact, count] of Object.entries(result.summary.byImpact)) {
      byImpact[impact] = (byImpact[impact] || 0) + count
    }

    // Aggregate WCAG compliance (average)
    wcagCompliance.A += result.summary.wcagCompliance.A
    wcagCompliance.AA += result.summary.wcagCompliance.AA
    wcagCompliance.AAA += result.summary.wcagCompliance.AAA
  }

  // Calculate averages
  const averageScore =
    successfulResults.length > 0 ? totalScore / successfulResults.length : 0
  const avgWcagA =
    successfulResults.length > 0
      ? wcagCompliance.A / successfulResults.length
      : 0
  const avgWcagAA =
    successfulResults.length > 0
      ? wcagCompliance.AA / successfulResults.length
      : 0
  const avgWcagAAA =
    successfulResults.length > 0
      ? wcagCompliance.AAA / successfulResults.length
      : 0

  return {
    totalIssues,
    averageScore: Math.round(averageScore * 100) / 100,
    totalUrls: results.length,
    successful,
    failed,
    byCategory,
    byImpact,
    wcagCompliance: {
      A: Math.round(avgWcagA * 100) / 100,
      AA: Math.round(avgWcagAA * 100) / 100,
      AAA: Math.round(avgWcagAAA * 100) / 100,
    },
  }
}

/**
 * audit_multiple_urls - Batch URL audit with progress updates
 * 
 * Tests multiple URLs efficiently with optional parallel processing and progress tracking.
 * 
 * @param input - Batch audit configuration
 * @param onProgress - Optional progress callback for streaming updates
 * @returns Array of audit results with aggregated summary
 */
export async function auditMultipleUrls(
  input: AuditMultipleUrlsInput,
  onProgress?: (progress: BatchAuditProgress) => void
): Promise<{
  results: Array<{ url: string; result?: AuditResult; error?: string }>
  summary: {
    total: number
    successful: number
    failed: number
    totalIssues: number
    averageScore: number
    byCategory: Record<string, number>
    byImpact: Record<string, number>
    wcagCompliance: { A: number; AA: number; AAA: number }
  }
  progress?: BatchAuditProgress
}> {
  const config = getConfig()
  const {
    urls,
    domain,
    parallel = 1,
    continueOnError = true,
    tags,
    engine: inputEngine,
    basicAuthUsername,
    basicAuthPassword,
  } = input
  const engine = inputEngine ?? config.engine

  // Normalize URLs
  const urlArray = Array.isArray(urls)
    ? urls
    : urls.split(',').map((u) => u.trim()).filter((u) => u.length > 0)

  if (urlArray.length === 0) {
    throw new Error('No valid URLs provided')
  }

  debugLog(
    `Starting batch audit: ${urlArray.length} URL(s), parallel: ${parallel}`
  )

  // Warm shared browser once for the whole batch (parallel workers reuse it).
  await acquireSharedBrowser()

  // Process URLs (parallel or sequential)
  const results =
    parallel > 1
      ? await processBatchParallel(
          urlArray,
          domain,
          tags,
          parallel,
          continueOnError,
          onProgress,
          engine as 'axe' | 'ace',
          basicAuthUsername,
          basicAuthPassword
        )
      : await processBatchSequential(
          urlArray,
          domain,
          tags,
          continueOnError,
          onProgress,
          engine as 'axe' | 'ace',
          basicAuthUsername,
          basicAuthPassword
        )

  // Calculate aggregated summary
  const aggregatedSummary = calculateAggregatedSummary(results)

  // Final progress update
  const finalProgress: BatchAuditProgress = {
    current: results.length,
    total: urlArray.length,
    percentage: 100,
    status: 'Complete',
    completedUrls: results
      .filter((r) => r.result)
      .map((r) => r.url),
    failedUrls: results.filter((r) => r.error).map((r) => r.url),
  }

  if (onProgress) {
    onProgress(finalProgress)
  }

  debugLog(
    `Batch audit complete: ${aggregatedSummary.successful} successful, ${aggregatedSummary.failed} failed`
  )

  return {
    results,
    summary: {
      total: aggregatedSummary.totalUrls,
      successful: aggregatedSummary.successful,
      failed: aggregatedSummary.failed,
      totalIssues: aggregatedSummary.totalIssues,
      averageScore: aggregatedSummary.averageScore,
      byCategory: aggregatedSummary.byCategory,
      byImpact: aggregatedSummary.byImpact,
      wcagCompliance: aggregatedSummary.wcagCompliance,
    },
    progress: finalProgress,
  }
}
