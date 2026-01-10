/**
 * Core audit tools
 * Implements: audit_url, audit_multiple_urls, audit_site
 */

import { chromium, type Browser, type Page } from 'playwright'
import { AccessibilityRunner } from '../core/accessibility-runner.js'
import { ResultProcessor } from '../core/result-processor.js'
import {
  retryWithBackoff,
  handleErrorGracefully,
  formatErrorMessage,
} from '../core/error-handler.js'
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
export async function auditUrl(input: AuditUrlInput): Promise<AuditResult> {
  const {
    url,
    domain,
    tags,
    waitForLoad = 'networkidle',
    timeout = 30,
  } = input

  // Normalize URL
  const fullUrl = normalizeUrl(url, domain)

  // Validate tags if provided
  if (tags && tags.length > 0) {
    const validTags: AccessibilityTag[] = [
      'wcag2a',
      'wcag2aa',
      'wcag2aaa',
      'wcag21a',
      'wcag21aa',
      'wcag21aaa',
      'best-practice',
    ]
    const invalidTags = tags.filter((tag) => !validTags.includes(tag as AccessibilityTag))
    if (invalidTags.length > 0) {
      throw new Error(
        `Invalid tags: ${invalidTags.join(', ')}. Valid tags are: ${validTags.join(', ')}`
      )
    }
  }

  let browser: Browser | null = null
  let page: Page | null = null

  try {
    // Launch browser with retry logic
    debugLog(`Launching browser for audit: ${fullUrl}`)
    browser = await retryWithBackoff(
      async () => {
        return await chromium.launch({
          headless: true,
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
        })
      },
      {
        maxRetries: 2,
        initialDelay: 1000,
      }
    )

    // Create page
    page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    })

    // Initialize AccessibilityRunner
    const accessibilityRunner = new AccessibilityRunner()

    // Run accessibility test with retry logic for transient errors
    debugLog(`Running accessibility test on: ${fullUrl}`)
    const accessibilityResult = await retryWithBackoff(
      async () => {
        return await accessibilityRunner.run(page!, {
          url: fullUrl,
          waitForLoad: waitForLoad as WaitStrategy,
          timeout: timeout * 1000, // Convert seconds to milliseconds
          tags: tags as AccessibilityTag[],
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

    const auditResult = resultProcessor.process(
      resultsToProcess,
      accessibilityResult.appliedFilters
    )

    debugLog(
      `Audit complete: ${auditResult.summary.totalIssues} issues found, score: ${auditResult.summary.score}/100`
    )

    return auditResult
  } catch (error) {
    const errorInfo = handleErrorGracefully(error, `audit_url: ${fullUrl}`)
    console.error(`Error during audit: ${formatErrorMessage(error, `audit_url: ${fullUrl}`)}`)
    throw new Error(errorInfo.error)
  } finally {
    // Cleanup with error handling
    if (page) {
      await page.close().catch((err) => {
        console.warn(`Warning: Error closing page: ${err}`)
      })
    }
    if (browser) {
      await browser.close().catch((err) => {
        console.warn(`Warning: Error closing browser: ${err}`)
      })
    }
  }
}

/**
 * Process a single URL in a batch audit with error handling
 */
async function processSingleUrl(
  url: string,
  domain: string | undefined,
  tags: string[] | undefined,
  continueOnError: boolean = true
): Promise<{ url: string; result?: AuditResult; error?: string }> {
  try {
    const result = await retryWithBackoff(
      async () => {
        return await auditUrl({
          url,
          domain,
          tags,
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
  onProgress?: (progress: BatchAuditProgress) => void
): Promise<Array<{ url: string; result?: AuditResult; error?: string }>> {
  const results: Array<{ url: string; result?: AuditResult; error?: string }> =
    []
  const completedUrls: string[] = []
  const failedUrls: string[] = []
  const startTime = Date.now()

  // Process URLs in batches
  for (let i = 0; i < urlArray.length; i += parallel) {
    const batch = urlArray.slice(i, i + parallel)
    const batchPromises = batch.map((url) =>
      processSingleUrl(url, domain, tags, continueOnError)
    )

    // Wait for batch to complete
    const batchResults = await Promise.allSettled(batchPromises)

    // Process batch results with graceful error handling
    for (let j = 0; j < batchResults.length; j++) {
      const promiseResult = batchResults[j]
      const url = batch[j]

      if (promiseResult.status === 'fulfilled') {
        const result = promiseResult.value
        results.push(result)

        if (result.result) {
          completedUrls.push(url)
        } else if (result.error) {
          failedUrls.push(url)
          // Only throw if continueOnError is false and it's a critical error
          if (!continueOnError) {
            const errorInfo = handleErrorGracefully(
              new Error(result.error),
              `Batch audit: ${url}`
            )
            // Only throw if it's not a transient error
            if (!errorInfo.retryable) {
              throw new Error(`Audit failed for ${url}: ${result.error}`)
            }
          }
        }
      } else {
        const errorInfo = handleErrorGracefully(
          promiseResult.reason,
          `Batch audit: ${url}`
        )
        const errorMessage = formatErrorMessage(
          promiseResult.reason,
          `Batch audit: ${url}`
        )
        results.push({ url, error: errorMessage })
        failedUrls.push(url)
        
        // Only throw if continueOnError is false and it's not a transient error
        if (!continueOnError && !errorInfo.retryable) {
          throw new Error(`Audit failed for ${url}: ${errorMessage}`)
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
        status: `Processing batch ${Math.floor(i / parallel) + 1} of ${Math.ceil(urlArray.length / parallel)}`,
        estimatedTimeRemaining,
        currentItem: batch[batch.length - 1],
        completedUrls: [...completedUrls],
        failedUrls: [...failedUrls],
        currentUrl: batch[batch.length - 1],
      })
    }

    // Log progress
    debugLog(
      `Progress: ${completed}/${urlArray.length} (${percentage}%) - Completed: ${completedUrls.length}, Failed: ${failedUrls.length}`
    )
  }

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
  onProgress?: (progress: BatchAuditProgress) => void
): Promise<Array<{ url: string; result?: AuditResult; error?: string }>> {
  const results: Array<{ url: string; result?: AuditResult; error?: string }> =
    []
  const completedUrls: string[] = []
  const failedUrls: string[] = []
  const startTime = Date.now()

  for (let i = 0; i < urlArray.length; i++) {
    const url = urlArray[i]
    const result = await processSingleUrl(url, domain, tags, continueOnError)
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
  const {
    urls,
    domain,
    parallel = 1,
    continueOnError = true,
    tags,
  } = input

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

  // Process URLs (parallel or sequential)
  const results =
    parallel > 1
      ? await processBatchParallel(
          urlArray,
          domain,
          tags,
          parallel,
          continueOnError,
          onProgress
        )
      : await processBatchSequential(
          urlArray,
          domain,
          tags,
          continueOnError,
          onProgress
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
