/**
 * AccessibilityRunner - Refactored accessibility execution logic
 * Handles running accessibility tests with support for tag filtering
 * and configurable wait strategies
 */

import { type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type {
  AccessibilityResults,
  AccessibilityReport,
  AccessibilityCategory,
  AccessibilityRuleData,
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
 * Configuration for running an accessibility test
 */
export interface AccessibilityRunnerConfig {
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
 * Result from running an accessibility test
 */
export interface AccessibilityRunnerResult {
  /** Raw accessibility results */
  accessibilityResults: AccessibilityResults
  /** Filtered results if tags were specified */
  filteredResults?: AccessibilityResults
  /** Applied filters information */
  appliedFilters?: {
    tags?: AccessibilityTag[]
    originalIssueCount?: number
  }
}

/**
 * AccessibilityRunner class - Handles accessibility test execution
 */
export class AccessibilityRunner {
  private accessibilityScriptPath: string
  private accessibilityScript: string | null = null

  constructor() {
    // Determine the path to accessibility script
    // Try accessibility-mcp-server directory first, then project root
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = path.dirname(currentFile)
    // Go from accessibility-mcp-server/src/core/ to accessibility-mcp-server directory
    const serverDir = path.resolve(currentDir, '../../')
    const serverScriptPath = path.join(serverDir, 'wave.min.js')
    
    // Also check project root (for backward compatibility)
    const projectRoot = path.resolve(currentDir, '../../../')
    const projectRootScriptPath = path.join(projectRoot, 'wave.min.js')
    
    // Prefer accessibility-mcp-server directory, fallback to project root
    if (fs.existsSync(serverScriptPath)) {
      this.accessibilityScriptPath = serverScriptPath
    } else if (fs.existsSync(projectRootScriptPath)) {
      this.accessibilityScriptPath = projectRootScriptPath
    } else {
      // Default to accessibility-mcp-server directory (will throw error if not found)
      this.accessibilityScriptPath = serverScriptPath
    }
  }

  /**
   * Load accessibility script from disk
   */
  private loadAccessibilityScript(): string {
    if (this.accessibilityScript) {
      return this.accessibilityScript
    }

    if (!fs.existsSync(this.accessibilityScriptPath)) {
      throw new Error(
        `Accessibility script not found at ${this.accessibilityScriptPath}. Please ensure wave.min.js exists in the project root.`
      )
    }

    this.accessibilityScript = fs.readFileSync(this.accessibilityScriptPath, 'utf8')
    return this.accessibilityScript
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
      `Page loading completed in ${elapsedTime}ms - proceeding with accessibility analysis`
    )
  }

  /**
   * Run accessibility analysis in the browser context
   */
  private async runAccessibilityAnalysis(page: Page): Promise<AccessibilityResults> {
    // Load the script content first
    const scriptContent = this.loadAccessibilityScript()

    debugLog('Running accessibility analysis...')

    // Inject script content directly (same approach as wave-test.ts which was working)
    // This avoids issues with addScriptTag path loading
    const accessibilityScanResults = (await page.evaluate((scriptContent: string) => {
        return new Promise((resolve, reject) => {
          try {
            // Debug logger for browser context (uses console.error which is available in browser)
            // @ts-ignore - Browser context code
            function debugLog(...args: any[]) {
              // @ts-ignore - Browser context code
              console.error(...args)
            }

            // Set up WAVE configuration (same as wave-test.ts)
            // @ts-ignore - Browser context code
            ;(window as any).waveconfig = {
              debug: false,
              extensionUrl: '',
              platform: 'standalone',
              browser: 'chrome',
            }

            // Inject WAVE script (same as wave-test.ts)
            // @ts-ignore - Browser context code
            const scriptElement = document.createElement('script')
            // @ts-ignore - Browser context code
            scriptElement.textContent = scriptContent
            // @ts-ignore - Browser context code
            document.head.appendChild(scriptElement)

            // Function to enhance accessibility results (injected into page context)
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
                    
                    // Extract tags from accessibility rule metadata if available
                    // Accessibility engine stores rule metadata in wave.rules[ruleId]
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

                // Wait for accessibility engine to initialize with retry logic
            // This code runs in browser context - DOM types are available
            /* eslint-disable @typescript-eslint/ban-ts-comment */
            // @ts-ignore - Browser context: window, document, etc. are available
            let attempts = 0
            const maxRetries = 100
            const retryDelay = 200

            // @ts-ignore - Browser context code
            const checkAccessibilityAvailability = () => {
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
                  debugLog('Accessibility engine available, checking DOM readiness...')

                  // Ensure DOM is completely ready before initializing accessibility engine
                  // @ts-ignore - Browser context code
                  if (document.readyState !== 'complete') {
                    debugLog('DOM not ready, waiting longer...')
                    setTimeout(checkAccessibilityAvailability, retryDelay)
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
                    setTimeout(checkAccessibilityAvailability, retryDelay)
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
                    setTimeout(checkAccessibilityAvailability, retryDelay)
                    return
                  }

                  debugLog('DOM ready, initializing accessibility engine...')

                  // Initialize accessibility engine with error handling
                  try {
                    // @ts-ignore - Browser context code
                    ;window.wave.fn.initialize()
                    debugLog('Accessibility engine initialized successfully')
                  } catch (initError: any) {
                    debugLog(
                      'Accessibility engine initialization failed, retrying...',
                      initError
                    )
                    if (attempts < maxRetries) {
                      setTimeout(checkAccessibilityAvailability, retryDelay * 2)
                      return
                    } else {
                      reject(
                        new Error(
                          `Accessibility engine initialization failed after retries: ${
                            initError.message
                          }`
                        )
                      )
                      return
                    }
                  }

                  // Run accessibility analysis
                  // @ts-ignore - Browser context code
                  ;window.wave.fn
                    .run()
                    .then((results: any) => {
                      debugLog('Accessibility analysis completed successfully')
                      // Enhance results with better DOM information
                      const enhancedResults = enhanceResultsWithDOMInfo(results)

                      resolve({
                        // @ts-ignore - Browser context code
                        url: window.location.href,
                        timestamp: new Date().toISOString(),
                        testEngine: {
                          name: 'Accessibility Analyzer',
                          version: '3.2.7',
                        },
                        testRunner: {
                          name: 'Standalone Accessibility Analyzer',
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
                          `Accessibility analysis execution failed: ${error.message}`
                        )
                      )
                    })
                } catch (error: any) {
                  debugLog('Unexpected error in accessibility process:', error)
                  if (attempts < maxRetries) {
                    setTimeout(checkAccessibilityAvailability, retryDelay * 2)
                  } else {
                    reject(
                      new Error(
                        `Accessibility process failed: ${error.message}`
                      )
                    )
                  }
                }
              } else if (attempts >= maxRetries) {
                reject(
                  new Error(
                    `Accessibility engine failed to initialize after ${maxRetries} attempts`
                  )
                )
              } else {
                // Retry after delay
                setTimeout(checkAccessibilityAvailability, retryDelay)
              }
            }

            checkAccessibilityAvailability()
            /* eslint-enable @typescript-eslint/ban-ts-comment */
          } catch (error: any) {
            reject(
              new Error(`Accessibility analysis failed: ${error.message}`)
            )
          }
        })
    }, scriptContent)) as AccessibilityResults

    debugLog('Accessibility analysis completed, processing results...')
    return accessibilityScanResults
  }

  /**
   * Count total issues in accessibility results
   */
  private countTotalIssues(violations: AccessibilityReport): number {
    let total = 0
    Object.values(violations).forEach((category: AccessibilityCategory | undefined) => {
      if (category && category.count) {
        total += category.count
      }
    })
    return total
  }

  /**
   * Get a mapping of common accessibility rule IDs to their accessibility tags
   * This is a fallback when the accessibility engine doesn't provide tag metadata directly
   */
  private getRuleTagMapping(): Record<string, AccessibilityTag[]> {
    // Common accessibility rule IDs mapped to their WCAG tags
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
   * Checks accessibility engine metadata first, then falls back to rule ID mapping
   */
  private ruleMatchesTags(
    ruleId: string,
    ruleData: AccessibilityRuleData,
    tags: AccessibilityTag[]
  ): boolean {
    // If no tags specified, include all rules
    if (!tags || tags.length === 0) {
      return true
    }

    // Check if rule has tags property (from accessibility engine metadata)
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
   * Filter accessibility results by accessibility tags
   */
  private filterByTags(
    results: AccessibilityResults,
    tags: AccessibilityTag[]
  ): AccessibilityResults {
    if (!tags || tags.length === 0) {
      return results
    }

    const filteredViolations: AccessibilityReport = {}

    Object.entries(results.violations).forEach(([categoryKey, category]) => {
      if (!category || !category.items) {
        return
      }

      const filteredItems: Record<string, AccessibilityRuleData> = {}

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
    config: AccessibilityRunnerConfig
  ): Promise<AccessibilityRunnerResult> {
    const {
      url,
      waitForLoad = 'networkidle',
      timeout = 30000,
      tags,
    } = config

    try {
      // Navigate and wait for page to be ready
      await this.navigateAndWait(page, url, waitForLoad, timeout)

      // Run accessibility analysis
      const accessibilityResults = await this.runAccessibilityAnalysis(page)

      // Count original issues before filtering
      const originalIssueCount = this.countTotalIssues(accessibilityResults.violations)

      // Filter by tags if specified
      let filteredResults: AccessibilityResults | undefined
      let appliedFilters:
        | {
            tags?: AccessibilityTag[]
            originalIssueCount?: number
          }
        | undefined

      if (tags && tags.length > 0) {
        filteredResults = this.filterByTags(accessibilityResults, tags)
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
        accessibilityResults,
        filteredResults,
        appliedFilters,
      }
    } catch (error) {
      console.error('Error running accessibility test:', error)
      // Re-throw with more context - let caller handle retry logic
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      throw new Error(
        `Accessibility test failed for ${url}: ${errorMessage}`
      )
    }
  }
}
