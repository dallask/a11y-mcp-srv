/**
 * WaveRunner - Refactored WAVE execution logic
 * Handles running WAVE accessibility tests with support for tag filtering
 * and configurable wait strategies
 */

import { type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type {
  WaveResults,
  WaveReport,
  WaveCategory,
  WaveRuleData,
  WaitStrategy,
  AccessibilityTag,
} from '../types/index.js'

/**
 * Debug logger that writes to stderr to avoid interfering with MCP protocol
 */
function debugLog(...args: any[]) {
  console.error(...args)
}

/**
 * Configuration for running a WAVE accessibility test
 */
export interface WaveRunnerConfig {
  /** URL to test */
  url: string
  /** Wait strategy for page loading */
  waitForLoad?: WaitStrategy
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Specific accessibility tags to filter by (e.g., ["wcag2a", "wcag2aa"]) */
  tags?: AccessibilityTag[]
}

/**
 * Result from running a WAVE test
 */
export interface WaveRunnerResult {
  /** Raw WAVE results */
  waveResults: WaveResults
  /** Filtered results if tags were specified */
  filteredResults?: WaveResults
  /** Applied filters information */
  appliedFilters?: {
    tags?: AccessibilityTag[]
    originalIssueCount?: number
  }
}

/**
 * WaveRunner class - Handles WAVE accessibility test execution
 */
export class WaveRunner {
  private waveScriptPath: string
  private waveScript: string | null = null

  constructor() {
    // Determine the path to wave.min.js
    // Try mcp-server directory first, then project root
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = path.dirname(currentFile)
    // Go from mcp-server/src/core/ to mcp-server directory
    const mcpServerDir = path.resolve(currentDir, '../../')
    const mcpServerWavePath = path.join(mcpServerDir, 'wave.min.js')
    
    // Also check project root
    const projectRoot = path.resolve(currentDir, '../../../')
    const projectRootWavePath = path.join(projectRoot, 'wave.min.js')
    
    // Prefer mcp-server directory, fallback to project root
    if (fs.existsSync(mcpServerWavePath)) {
      this.waveScriptPath = mcpServerWavePath
    } else if (fs.existsSync(projectRootWavePath)) {
      this.waveScriptPath = projectRootWavePath
    } else {
      // Default to mcp-server directory (will throw error if not found)
      this.waveScriptPath = mcpServerWavePath
    }
  }

  /**
   * Load WAVE script from disk
   * @deprecated Now using addScriptTag with path instead
   */
  // @ts-ignore - Method kept for potential future use
  private loadWaveScript(): string {
    if (this.waveScript) {
      return this.waveScript
    }

    if (!fs.existsSync(this.waveScriptPath)) {
      throw new Error(
        `WAVE script not found at ${this.waveScriptPath}. Please ensure wave.min.js exists in the project root.`
      )
    }

    this.waveScript = fs.readFileSync(this.waveScriptPath, 'utf8')
    return this.waveScript
  }

  /**
   * Navigate to URL and wait for page to be ready
   */
  private async navigateAndWait(
    page: Page,
    url: string,
    waitStrategy: WaitStrategy = 'networkidle',
    timeout: number = 30000
  ): Promise<void> {
    debugLog(`Navigating to ${url}...`)
    const startTime = Date.now()

    // Basic navigation
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    })
    debugLog('Page navigation started')

    // Wait for page to stabilize based on strategy
    const remainingTime = timeout - (Date.now() - startTime)

    if (remainingTime > 0) {
      try {
        switch (waitStrategy) {
          case 'networkidle':
            await page.waitForLoadState('networkidle', {
              timeout: Math.min(remainingTime, 6000),
            })
            debugLog('Page reached networkidle state')
            break
          case 'load':
            await page.waitForLoadState('load', {
              timeout: Math.min(remainingTime, 6000),
            })
            debugLog('Page reached load state')
            break
          case 'domcontentloaded':
            // Already waited for domcontentloaded in goto
            debugLog('DOM content loaded')
            break
        }

        // Additional wait for DOM readiness
        const finalWaitTime = timeout - (Date.now() - startTime)
        if (finalWaitTime > 1000) {
          try {
            // @ts-ignore - Browser context: document is available in page.evaluate context
            await page.waitForFunction(
              () =>
                // @ts-ignore - Browser context code
                document.readyState === 'complete' && document.body !== null,
              { timeout: Math.min(finalWaitTime, 2000) }
            )
            debugLog('DOM is ready')
          } catch (error) {
            debugLog('DOM readiness check timed out, proceeding anyway...')
          }
        }
      } catch (error) {
        debugLog('Page still loading, but proceeding with analysis...')
      }
    }

    const elapsedTime = Date.now() - startTime
    debugLog(
      `Page loading completed in ${elapsedTime}ms - proceeding with WAVE analysis`
    )
  }

  /**
   * Run WAVE analysis in the browser context
   */
  private async runWaveAnalysis(page: Page): Promise<WaveResults> {
    const waveScriptPath = this.waveScriptPath

    debugLog('Running WAVE analysis...')

    // Load WAVE using addScriptTag with path instead of inject via content
    // This avoids serialization issues
    await page.evaluate(() => {
      // @ts-ignore - Browser context
      ;(window as any).waveconfig = {
        debug: false,
        extensionUrl: '',
        platform: 'standalone',
        browser: 'chrome',
      }
    })
    
    // Use addScriptTag with file path - this bypasses serialization
    await page.addScriptTag({ path: waveScriptPath })
    
    // Wait for WAVE to be available
    await page.waitForFunction(
      () => {
        // @ts-ignore - Browser context
        return typeof (window as any).wave !== 'undefined' && (window as any).wave && (window as any).wave.fn
      },
      { timeout: 10000 }
    )

    // Now run the WAVE analysis in a separate evaluate context
    const accessibilityScanResults = (await page.evaluate(() => {
        return new Promise((resolve, reject) => {
          try {

            // Function to enhance WAVE results (injected into page context)
            // This code runs in browser context, so DOM types are available
            // @ts-ignore - Browser context code
            function enhanceResultsWithDOMInfo(results) {
              // @ts-ignore - Browser context code
              function getElementInfo(xpath) {
                try {
                  // @ts-ignore - Browser context: document is available in page.evaluate context
                  // @ts-ignore - Browser context code
                  // @ts-ignore - Browser context: document is available in page.evaluate context
                  const element = document.evaluate(
                    xpath,
                    // @ts-ignore - Browser context code
                    document,
                    null,
                    // @ts-ignore - Browser context code
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                  ).singleNodeValue
                  if (!element) return null

                  return {
                    // @ts-ignore - Browser context code
                    tagName: element.tagName,
                    id: element.id || null,
                    className: element.className || null,
                    textContent: element.textContent
                      ? element.textContent.trim().substring(0, 100)
                      : null,
                    // @ts-ignore - Browser context code
                    innerHTML: element.innerHTML
                      ? element.innerHTML.substring(0, 200)
                      : null,
                    // @ts-ignore - Browser context code
                    attributes: Array.from(
                      element.attributes || []
                    ).reduce((acc: any, attr: any) => {
                      acc[attr.name] = attr.value
                      return acc
                    }, {}),
                    // @ts-ignore - Browser context code
                    selector: generateSelector(element),
                  }
                } catch (error: any) {
                  return { error: error.message }
                }
              }

              // @ts-ignore - Browser context code
              function generateSelector(element: any) {
                if (element.id) return `#${element.id}`
                if (element.className) {
                  const classes = element.className
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .join('.')
                  return `.${classes}`
                }
                return element.tagName.toLowerCase()
              }

              const enhanced = JSON.parse(JSON.stringify(results))

              // Filter to only include error and contrast categories
              const filteredCategories: any = {}
              if (enhanced.categories && enhanced.categories.error) {
                filteredCategories.error = enhanced.categories.error
              }
              if (enhanced.categories && enhanced.categories.contrast) {
                filteredCategories.contrast = enhanced.categories.contrast
              }

              // Enhance error and contrast categories
              Object.keys(filteredCategories).forEach((categoryKey) => {
                const category = filteredCategories[categoryKey]
                if (category.items) {
                  Object.keys(category.items).forEach((itemKey) => {
                    const item = category.items[itemKey]
                    
                    // Extract tags from WAVE rule metadata if available
                    // WAVE stores rule metadata in wave.rules[ruleId]
                    // @ts-ignore - Browser context code
                    if (typeof window !== 'undefined' && window.wave && window.wave.rules) {
                      // @ts-ignore - Browser context code
                      const ruleMetadata = window.wave.rules[itemKey]
                      if (ruleMetadata && ruleMetadata.tags) {
                        item.tags = ruleMetadata.tags
                      }
                    }
                    
                    if (item.xpaths && Array.isArray(item.xpaths)) {
                      // Deduplicate XPaths
                      const uniqueXPaths = [...new Set(item.xpaths)]
                      item.xpaths = uniqueXPaths

                      // Update count to reflect actual unique instances
                      item.count = uniqueXPaths.length

                      // Get DOM info for unique XPaths only
                      item.domInfo = uniqueXPaths
                        .map((xpath) => getElementInfo(xpath))
                        .filter((info) => info !== null)

                      // Also deduplicate other arrays that might have duplicates
                      if (item.selectors && Array.isArray(item.selectors)) {
                        item.selectors = item.selectors.slice(
                          0,
                          uniqueXPaths.length
                        )
                      }
                      if (item.text && Array.isArray(item.text)) {
                        item.text = item.text.slice(0, uniqueXPaths.length)
                      }
                      if (item.hidden && Array.isArray(item.hidden)) {
                        item.hidden = item.hidden.slice(0, uniqueXPaths.length)
                      }
                      if (
                        item.contrastdata &&
                        Array.isArray(item.contrastdata)
                      ) {
                        item.contrastdata = item.contrastdata.slice(
                          0,
                          uniqueXPaths.length
                        )
                      }
                    }
                  })
                }
              })

              // Recalculate category counts after deduplication
              Object.keys(filteredCategories).forEach((categoryKey) => {
                const category = filteredCategories[categoryKey]
                if (category.items) {
                  // Recalculate total count for this category
                  category.count = Object.values(category.items).reduce(
                    (total: any, item: any) => total + (item.count || 0),
                    0
                  )
                }
              })

              // Return only filtered categories
              enhanced.categories = filteredCategories
              return enhanced
            }

                // Wait for WAVE to initialize with retry logic
            // This code runs in browser context - DOM types are available
            /* eslint-disable @typescript-eslint/ban-ts-comment */
            // @ts-ignore - Browser context: window, document, etc. are available
            let attempts = 0
            const maxRetries = 100
            const retryDelay = 200

            // @ts-ignore - Browser context code
            const checkWaveAvailability = () => {
              attempts++

              // @ts-ignore - Browser context: window is available in page.evaluate context
              if (
                // @ts-ignore - Browser context code
                typeof window !== 'undefined' &&
                // @ts-ignore - Browser context code
                window.wave !== 'undefined' &&
                // @ts-ignore - Browser context code
                window.wave.fn
              ) {
                try {
                  debugLog('WAVE available, checking DOM readiness...')

                  // Ensure DOM is completely ready before initializing WAVE
                  // @ts-ignore - Browser context code
                  if (document.readyState !== 'complete') {
                    debugLog('DOM not ready, waiting longer...')
                    setTimeout(checkWaveAvailability, retryDelay)
                    return
                  }

                  // Check if body exists and has been styled
                  // @ts-ignore - Browser context: document is available in page.evaluate context
                  if (
                    // @ts-ignore - Browser context code
                    !document.body ||
                    // @ts-ignore - Browser context code
                    !document.body.style ||
                    // @ts-ignore - Browser context code
                    !document.head
                  ) {
                    debugLog('Body or head not ready, waiting...')
                    setTimeout(checkWaveAvailability, retryDelay)
                    return
                  }

                  // Additional check for any elements that might cause style access issues
                  try {
                    // @ts-ignore - Browser context code
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const _testStyle = document.body.style.display
                    debugLog('Style access test passed')
                  } catch (styleError) {
                    debugLog('Style access test failed, waiting...', styleError)
                    setTimeout(checkWaveAvailability, retryDelay)
                    return
                  }

                  debugLog('DOM ready, initializing WAVE...')

                  // Initialize WAVE with error handling
                  try {
                    // @ts-ignore - Browser context code
                    ;window.wave.fn.initialize()
                    debugLog('WAVE initialized successfully')
                  } catch (initError: any) {
                    debugLog(
                      'WAVE initialization failed, retrying...',
                      initError
                    )
                    if (attempts < maxRetries) {
                      setTimeout(checkWaveAvailability, retryDelay * 2)
                      return
                    } else {
                      reject(
                        new Error(
                          `WAVE initialization failed after retries: ${
                            initError.message
                          }`
                        )
                      )
                      return
                    }
                  }

                  // Run WAVE analysis
                  // @ts-ignore - Browser context code
                  ;window.wave.fn
                    .run()
                    .then((results: any) => {
                      debugLog('WAVE analysis completed successfully')
                      // Enhance results with better DOM information
                      const enhancedResults = enhanceResultsWithDOMInfo(results)

                      resolve({
                        // @ts-ignore - Browser context code
                        url: window.location.href,
                        timestamp: new Date().toISOString(),
                        testEngine: {
                          name: 'WAVE',
                          version: '3.2.7',
                        },
                        testRunner: {
                          name: 'WAVE Standalone Analyzer',
                        },
                        testEnvironment: {
                          // @ts-ignore - Browser context code
                          userAgent: navigator.userAgent,
                          // @ts-ignore - Browser context code
                          windowWidth: window.innerWidth,
                          // @ts-ignore - Browser context code
                          windowHeight: window.innerHeight,
                          // @ts-ignore - Browser context code
                          orientationType: screen.orientation?.type,
                          // @ts-ignore - Browser context code
                          orientationAngle: screen.orientation?.angle,
                        },
                        violations: enhancedResults.categories || {},
                      })
                    })
                    .catch((error: any) => {
                      reject(
                        new Error(
                          `WAVE analysis execution failed: ${error.message}`
                        )
                      )
                    })
                } catch (error: any) {
                  debugLog('Unexpected error in WAVE process:', error)
                  if (attempts < maxRetries) {
                    setTimeout(checkWaveAvailability, retryDelay * 2)
                  } else {
                    reject(
                      new Error(
                        `WAVE process failed: ${error.message}`
                      )
                    )
                  }
                }
              } else if (attempts >= maxRetries) {
                reject(
                  new Error(
                    `WAVE failed to initialize after ${maxRetries} attempts`
                  )
                )
              } else {
                // Retry after delay
                setTimeout(checkWaveAvailability, retryDelay)
              }
            }

            checkWaveAvailability()
            /* eslint-enable @typescript-eslint/ban-ts-comment */
          } catch (error: any) {
            reject(
              new Error(`WAVE analysis failed: ${error.message}`)
            )
          }
        })
      }
    )) as WaveResults

    debugLog('WAVE analysis completed, processing results...')
    return accessibilityScanResults
  }

  /**
   * Count total issues in WAVE results
   */
  private countTotalIssues(violations: WaveReport): number {
    let total = 0
    Object.values(violations).forEach((category: WaveCategory | undefined) => {
      if (category && category.count) {
        total += category.count
      }
    })
    return total
  }

  /**
   * Get a mapping of common WAVE rule IDs to their accessibility tags
   * This is a fallback when WAVE doesn't provide tag metadata directly
   */
  private getRuleTagMapping(): Record<string, AccessibilityTag[]> {
    // Common WAVE rule IDs mapped to their WCAG tags
    // This is a partial mapping - in production, this should be comprehensive
    return {
      // Contrast-related rules (WCAG 2.1 AA)
      contrast: ['wcag21aa', 'wcag2aa'],
      // Missing alt text (WCAG 2.1 A)
      alt_missing: ['wcag21a', 'wcag2a'],
      alt_link_missing: ['wcag21a', 'wcag2a'],
      // Form labels (WCAG 2.1 A)
      label_missing: ['wcag21a', 'wcag2a'],
      label_empty: ['wcag21a', 'wcag2a'],
      // Headings (WCAG 2.1 A)
      heading_empty: ['wcag21a', 'wcag2a'],
      // Language (WCAG 2.1 A)
      language_missing: ['wcag21a', 'wcag2a'],
      // Link text (WCAG 2.1 A)
      link_empty: ['wcag21a', 'wcag2a'],
      link_skip_broken: ['wcag21a', 'wcag2a'],
      // ARIA (WCAG 2.1 A)
      aria_reference_broken: ['wcag21a', 'wcag2a'],
      aria_hidden: ['wcag21a', 'wcag2a'],
      // Focus (WCAG 2.1 A)
      focus_order: ['wcag21a', 'wcag2a'],
      // Keyboard (WCAG 2.1 A)
      keyboard: ['wcag21a', 'wcag2a'],
    }
  }

  /**
   * Check if a rule matches any of the specified tags
   * Checks WAVE metadata first, then falls back to rule ID mapping
   */
  private ruleMatchesTags(
    ruleId: string,
    ruleData: WaveRuleData,
    tags: AccessibilityTag[]
  ): boolean {
    // If no tags specified, include all rules
    if (!tags || tags.length === 0) {
      return true
    }

    // Check if rule has tags property (from WAVE metadata)
    if (ruleData.tags && Array.isArray(ruleData.tags)) {
      return ruleData.tags.some((tag) => tags.includes(tag as AccessibilityTag))
    }

    // Fallback: Use rule ID to tag mapping
    const ruleTagMapping = this.getRuleTagMapping()
    const ruleTags = ruleTagMapping[ruleId]
    if (ruleTags && ruleTags.length > 0) {
      return ruleTags.some((tag) => tags.includes(tag))
    }

    // If no mapping found and no tags in metadata, include the rule
    // (better to show all issues than to hide potentially important ones)
    return true
  }

  /**
   * Filter WAVE results by accessibility tags
   */
  private filterByTags(
    results: WaveResults,
    tags: AccessibilityTag[]
  ): WaveResults {
    if (!tags || tags.length === 0) {
      return results
    }

    const filteredViolations: WaveReport = {}

    Object.entries(results.violations).forEach(([categoryKey, category]) => {
      if (!category || !category.items) {
        return
      }

      const filteredItems: Record<string, WaveRuleData> = {}

      Object.entries(category.items).forEach(([ruleId, ruleData]) => {
        if (this.ruleMatchesTags(ruleId, ruleData, tags)) {
          filteredItems[ruleId] = ruleData
        }
      })

      // Only include category if it has matching items
      if (Object.keys(filteredItems).length > 0) {
        // Recalculate category count
        const categoryCount = Object.values(filteredItems).reduce(
          (total, item) => total + (item.count || 0),
          0
        )

        filteredViolations[categoryKey] = {
          count: categoryCount,
          items: filteredItems,
        }
      }
    })

    return {
      ...results,
      violations: filteredViolations,
    }
  }

  /**
   * Run accessibility test on a URL
   */
  async run(
    page: Page,
    config: WaveRunnerConfig
  ): Promise<WaveRunnerResult> {
    const {
      url,
      waitForLoad = 'networkidle',
      timeout = 30000,
      tags,
    } = config

    try {
      // Navigate and wait for page to be ready
      await this.navigateAndWait(page, url, waitForLoad, timeout)

      // Run WAVE analysis
      const waveResults = await this.runWaveAnalysis(page)

      // Count original issues before filtering
      const originalIssueCount = this.countTotalIssues(waveResults.violations)

      // Filter by tags if specified
      let filteredResults: WaveResults | undefined
      let appliedFilters:
        | {
            tags?: AccessibilityTag[]
            originalIssueCount?: number
          }
        | undefined

      if (tags && tags.length > 0) {
        filteredResults = this.filterByTags(waveResults, tags)
        const filteredIssueCount = this.countTotalIssues(
          filteredResults.violations
        )

        appliedFilters = {
          tags,
          originalIssueCount,
        }

        debugLog(
          `Filtered results: ${originalIssueCount} -> ${filteredIssueCount} issues (tags: ${tags.join(', ')})`
        )
      }

      return {
        waveResults,
        filteredResults,
        appliedFilters,
      }
    } catch (error) {
      console.error('Error running WAVE test:', error)
      // Re-throw with more context - let caller handle retry logic
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      throw new Error(
        `WAVE accessibility test failed for ${url}: ${errorMessage}`
      )
    }
  }
}
