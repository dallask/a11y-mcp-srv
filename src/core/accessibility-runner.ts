/**
 * AccessibilityRunner - Runs accessibility tests using axe-core or IBM Equal Access (ACE)
 * Replaces previous WAVE-based implementation with axe-core and accessibility-checker.
 */

import { type Page } from 'playwright'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type {
  AccessibilityResults,
  AccessibilityReport,
  AccessibilityCategory,
  AccessibilityRuleData,
  AccessibilityTag,
  AccessibilityEngine,
  WaitStrategy,
} from '../types/index.js'
import type { DOMInfo } from '../types/index.js'

/**
 * Debug logger that writes to stderr to avoid interfering with MCP protocol
 */
function debugLog(...args: unknown[]) {
  console.error(...args)
}

/** Re-export for callers that use runner config */
export type { AccessibilityEngine } from '../types/index.js'

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
  /** Accessibility tags to pass to the engine as runOnly scope */
  tags?: AccessibilityTag[]
  /** Engine to use: axe-core (default) or IBM Equal Access */
  engine?: AccessibilityEngine
  /** Whether to post-filter results by tags (default: false).
   *  Set to true only when the user explicitly requested specific tags.
   *  When false, tags are passed to the engine for scoping but all returned issues are shown. */
  applyTagFilter?: boolean
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

/** Default axe-core tags for WCAG 2.1 AA */
const DEFAULT_AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'best-practice',
]

/** Axe violation node (from axe-core result) */
interface AxeNode {
  html?: string
  target?: string[]
  failureSummary?: string
}

/** Axe violation (from axe-core result) */
interface AxeViolation {
  id: string
  impact?: string
  tags?: string[]
  description?: string
  help?: string
  helpUrl?: string
  nodes: AxeNode[]
}

/** Axe results shape (subset we use) */
interface AxeResultsShape {
  violations: AxeViolation[]
  url?: string
  timestamp?: string
}

/** ACE result item (from accessibility-checker report) */
interface ACEResultItem {
  ruleId: string
  message: string
  path: { dom: string; aria?: string }
  snippet: string
  category: string
  level: string // violation | potentialviolation | recommendation | potentialrecommendation | manual | pass
  value?: [string, string] // e.g. [VIOLATION, FAIL] - optional
}

/** ACE report (from accessibility-checker) */
interface ACEReport {
  summary: {
    URL: string
    scanTime: number
    counts: {
      violation: number
      potentialviolation: number
      recommendation?: number
    }
  }
  results: ACEResultItem[]
}

/**
 * AccessibilityRunner class - Handles accessibility test execution with axe-core or ACE
 */
export class AccessibilityRunner {
  private axePath: string

  constructor() {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = path.dirname(currentFile)
    const serverDir = path.resolve(currentDir, '../../')
    this.axePath = path.join(serverDir, 'node_modules', 'axe-core', 'axe.min.js')
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

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    })
    debugLog('Page navigation started')

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
            debugLog('DOM content loaded')
            break
        }
        const finalWaitTime = timeout - (Date.now() - startTime)
        if (finalWaitTime > 1000) {
          try {
            await page.waitForFunction(
              () =>
                (typeof document !== 'undefined' &&
                  document.readyState === 'complete' &&
                  document.body !== null) as boolean,
              { timeout: Math.min(finalWaitTime, 2000) }
            )
            debugLog('DOM is ready')
          } catch {
            debugLog('DOM readiness check timed out, proceeding anyway...')
          }
        }
      } catch {
        debugLog('Page still loading, but proceeding with analysis...')
      }
    }

    debugLog(
      `Page loading completed in ${Date.now() - startTime}ms - proceeding with accessibility analysis`
    )
  }

  /**
   * Build axe run options (runOnly tags)
   */
  private buildAxeOptions(tags?: AccessibilityTag[]): { runOnly: string[] } {
    const runOnly =
      tags && tags.length > 0 ? [...tags] : [...DEFAULT_AXE_TAGS]
    return { runOnly }
  }

  /**
   * Run axe-core analysis in the browser and return raw axe result
   */
  private async runAxeAnalysis(
    page: Page,
    tags?: AccessibilityTag[]
  ): Promise<AxeResultsShape> {
    const axeOptions = this.buildAxeOptions(tags)
    await page.addScriptTag({ path: this.axePath })

    const rawResult = await page.evaluate(
      (options: { runOnly: string[] }) => {
        return new Promise<AxeResultsShape>((resolve, reject) => {
          if (typeof (window as unknown as { axe?: { run: (o: unknown) => Promise<AxeResultsShape> } }).axe?.run !== 'function') {
            reject(new Error('axe.run is not available'))
            return
          }
          ;(window as unknown as { axe: { run: (o: unknown) => Promise<AxeResultsShape> } })
            .axe.run(options)
            .then(resolve)
            .catch(reject)
        })
      },
      axeOptions
    )

    return rawResult
  }

  /**
   * Convert axe-core results to our AccessibilityResults format
   */
  private axeToAccessibilityResults(
    axeResult: AxeResultsShape,
    url: string,
    testEnvironment: {
      userAgent: string
      windowWidth: number
      windowHeight: number
      orientationType?: string
      orientationAngle?: number
    }
  ): AccessibilityResults {
    const violations: AccessibilityReport = {}
    const timestamp = new Date().toISOString()

    axeResult.violations.forEach((v: AxeViolation) => {
      const categoryKey =
        v.id.toLowerCase().includes('color-contrast') ||
        v.id.toLowerCase().includes('contrast')
          ? 'contrast'
          : 'error'

      if (!violations[categoryKey]) {
        violations[categoryKey] = { count: 0, items: {} }
      }

      const xpaths = (v.nodes || []).map(
        (n) => (n.target && n.target[0]) || ''
      )
      const domInfo: DOMInfo[] = (v.nodes || []).map((n) => ({
        innerHTML: n.html ? n.html.substring(0, 200) : null,
        selector: n.target && n.target[0],
      }))

      // Map axe-core impact levels to IBM Equal Access severity levels.
      // Axe violations are definite failures → 'violation'.
      // (Axe "incomplete" items would be 'needs-review' but we only process violations here.)
      const axeImpact = v.impact?.toLowerCase()
      const impact: AccessibilityRuleData['impact'] =
        axeImpact === 'critical' || axeImpact === 'serious'
          ? 'violation'
          : axeImpact === 'moderate'
            ? 'needs-review'
            : 'recommendation'

      const ruleData: AccessibilityRuleData = {
        count: v.nodes?.length ?? 0,
        xpaths,
        description: v.description ?? v.help ?? v.id,
        domInfo,
        tags: v.tags ?? [],
        impact,
      }

      violations[categoryKey].items[v.id] = ruleData
      violations[categoryKey].count += ruleData.count
    })

    return {
      url,
      timestamp,
      testEngine: { name: 'axe-core', version: '4.x' },
      testRunner: { name: 'Standalone Accessibility Analyzer' },
      testEnvironment,
      violations,
    }
  }

  /**
   * Run IBM Equal Access (accessibility-checker) analysis for a URL
   */
  private async runACEAnalysis(
    url: string,
    _tags?: AccessibilityTag[]
  ): Promise<AccessibilityResults> {
    const aChecker = await import('accessibility-checker')
    const label = `audit-${Date.now()}`

    try {
      const result = await aChecker.getCompliance(url, label)
      const report = result.report as unknown as ACEReport
      return this.aceToAccessibilityResults(report, url)
    } finally {
      await aChecker.close?.()
    }
  }

  /**
   * Map ACE report level to IBM Equal Access severity levels.
   * Matches the IBM browser tool exactly:
   *   violation              → 'violation'      (🚫 red)
   *   potentialviolation     → 'needs-review'   (⚠️ yellow)
   *   potentialrecommendation→ 'needs-review'   (⚠️ yellow)
   *   recommendation         → 'recommendation' (ℹ️ blue)
   *   manual                 → 'needs-review'   (⚠️ yellow – manual check required)
   *   pass / ignored         → 'minor'
   */
  private aceLevelToImpact(level: string): AccessibilityRuleData['impact'] {
    const l = level.toLowerCase()
    if (l === 'violation') return 'violation'
    if (l === 'potentialviolation' || l === 'potentialrecommendation' || l === 'manual') return 'needs-review'
    if (l === 'recommendation') return 'recommendation'
    return 'minor'
  }

  /**
   * Compare impact severity (higher = worse). Used to take the worst impact per rule.
   */
  private impactRank(a: AccessibilityRuleData['impact']): number {
    if (!a) return 0
    const r: Record<NonNullable<AccessibilityRuleData['impact']>, number> = {
      violation: 4,
      'needs-review': 3,
      recommendation: 2,
      minor: 1,
    }
    return r[a] ?? 0
  }

  /**
   * Convert ACE report to our AccessibilityResults format.
   * Preserves ACE severity (critical/serious/moderate) so output matches the IBM browser tool.
   */
  private aceToAccessibilityResults(
    report: ACEReport,
    url: string
  ): AccessibilityResults {
    const violations: AccessibilityReport = { error: { count: 0, items: {} } }
    const timestamp = new Date().toISOString()

    const violationItems = report.results.filter(
      (r) =>
        r.level === 'violation' ||
        r.level === 'potentialviolation' ||
        r.level === 'recommendation' ||
        r.level === 'potentialrecommendation'
    )

    violationItems.forEach((item: ACEResultItem) => {
      const ruleId = item.ruleId
      const itemImpact = this.aceLevelToImpact(item.level)
      if (!violations.error!.items[ruleId]) {
        violations.error!.items[ruleId] = {
          count: 0,
          xpaths: [],
          description: item.message,
          domInfo: [],
          tags: [],
          impact: itemImpact,
        }
      }

      const rule = violations.error!.items[ruleId]
      rule.count += 1
      rule.xpaths.push(item.path.dom || '')
      rule.domInfo!.push({
        innerHTML: item.snippet ? item.snippet.substring(0, 200) : null,
        selector: item.path.dom,
      })
      if (itemImpact && this.impactRank(itemImpact) > this.impactRank(rule.impact)) {
        rule.impact = itemImpact
      }
    })

    Object.values(violations.error!.items).forEach((rule) => {
      violations.error!.count += rule.count
    })

    return {
      url,
      timestamp,
      testEngine: { name: 'IBM Equal Access', version: '4.x' },
      testRunner: { name: 'accessibility-checker' },
      testEnvironment: {
        userAgent: 'accessibility-checker',
        windowWidth: 1280,
        windowHeight: 720,
      },
      violations,
    }
  }

  /**
   * Run accessibility analysis (axe in browser, or ACE via getCompliance)
   */
  private async runAccessibilityAnalysis(
    page: Page,
    url: string,
    engine: AccessibilityEngine,
    tags?: AccessibilityTag[]
  ): Promise<AccessibilityResults> {
    if (engine === 'ace') {
      return this.runACEAnalysis(url, tags)
    }

    const axeResult = await this.runAxeAnalysis(page, tags)
    const viewport = page.viewportSize()
    const testEnvironment = {
      userAgent: await page.evaluate(() => navigator.userAgent),
      windowWidth: viewport?.width ?? 1280,
      windowHeight: viewport?.height ?? 720,
      orientationType: await page
        .evaluate(() => (screen as { orientation?: { type?: string } }).orientation?.type)
        .catch(() => undefined),
      orientationAngle: await page
        .evaluate(() => (screen as { orientation?: { angle?: number } }).orientation?.angle)
        .catch(() => undefined),
    }

    return this.axeToAccessibilityResults(axeResult, url, testEnvironment)
  }

  /**
   * Count total issues in violations
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
   * Get a mapping of common accessibility rule IDs to their accessibility tags.
   * Includes both axe-core and ACE-style rule IDs; WCAG 2.2 tags ensure strict
   * tag filters (e.g. wcag22aa only) still include these rules.
   */
  private getRuleTagMapping(): Record<string, AccessibilityTag[]> {
    const wcagA: AccessibilityTag[] = [
      'wcag2a',
      'wcag21a',
      'wcag22a',
    ]
    const wcagAA: AccessibilityTag[] = [
      'wcag2aa',
      'wcag21aa',
      'wcag22aa',
    ]
    return {
      'color-contrast': ['wcag21aa', 'wcag2aa', 'wcag22aa'],
      'image-alt': wcagA,
      label: wcagA,
      'heading-order': wcagA,
      'html-has-lang': wcagA,
      'link-name': wcagA,
      'aria-valid-attr-value': wcagA,
      tabindex: wcagA,
      'button-name': wcagA,
      'document-title': wcagA,
      'heading_empty': wcagA,
      'button_empty': wcagA,
      'aria_reference_broken': wcagA,
      contrast: ['wcag21aa', 'wcag2aa', 'wcag22aa'],
      // ACE-style rule IDs (common patterns)
      'RPT_Header_HasContent': wcagA,
      'RPT_Button_AccessibleName': wcagA,
      'RPT_Label_FormControls': wcagA,
      'RPT_Elem_UniqueId': wcagA,
      'IBMA_Color_Contrast_WCAG2AA': wcagAA,
    }
  }

  /**
   * Check if a rule matches any of the specified tags
   */
  private ruleMatchesTags(
    ruleId: string,
    ruleData: AccessibilityRuleData,
    tags: AccessibilityTag[]
  ): boolean {
    if (!tags || tags.length === 0) return true
    if (ruleData.tags && Array.isArray(ruleData.tags)) {
      return ruleData.tags.some((tag) => tags.includes(tag as AccessibilityTag))
    }
    const mapping = this.getRuleTagMapping()
    const ruleTags = mapping[ruleId]
    if (ruleTags?.length) {
      return ruleTags.some((tag) => tags.includes(tag))
    }
    return true
  }

  /**
   * Filter accessibility results by tags
   */
  private filterByTags(
    results: AccessibilityResults,
    tags: AccessibilityTag[]
  ): AccessibilityResults {
    if (!tags || tags.length === 0) return results

    const filteredViolations: AccessibilityReport = {}

    Object.entries(results.violations).forEach(([categoryKey, category]) => {
      if (!category?.items) return

      const filteredItems: Record<string, AccessibilityRuleData> = {}
      Object.entries(category.items).forEach(([ruleId, ruleData]) => {
        if (this.ruleMatchesTags(ruleId, ruleData, tags)) {
          filteredItems[ruleId] = ruleData
        }
      })

      if (Object.keys(filteredItems).length > 0) {
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

    return { ...results, violations: filteredViolations }
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
      engine = 'axe',
      applyTagFilter = false,
    } = config

    try {
      if (engine === 'ace') {
        debugLog(`Running IBM Equal Access (ACE) analysis on ${url}...`)
        const accessibilityResults = await this.runACEAnalysis(url, tags)
        const originalIssueCount = this.countTotalIssues(accessibilityResults.violations)

        let filteredResults: AccessibilityResults | undefined
        let appliedFilters: AccessibilityRunnerResult['appliedFilters']

        if (applyTagFilter && tags && tags.length > 0) {
          filteredResults = this.filterByTags(accessibilityResults, tags)
          appliedFilters = { tags, originalIssueCount }
          debugLog(
            `Filtered results: ${originalIssueCount} -> ${this.countTotalIssues(filteredResults.violations)} issues`
          )
        }

        return {
          accessibilityResults,
          filteredResults,
          appliedFilters,
        }
      }

      await this.navigateAndWait(page, url, waitForLoad, timeout)
      debugLog(`Running axe-core analysis on ${url}...`)

      const accessibilityResults = await this.runAccessibilityAnalysis(
        page,
        url,
        'axe',
        tags
      )

      const originalIssueCount = this.countTotalIssues(accessibilityResults.violations)

      let filteredResults: AccessibilityResults | undefined
      let appliedFilters: AccessibilityRunnerResult['appliedFilters']

      if (applyTagFilter && tags && tags.length > 0) {
        filteredResults = this.filterByTags(accessibilityResults, tags)
        appliedFilters = { tags, originalIssueCount }
        debugLog(
          `Filtered results: ${originalIssueCount} -> ${this.countTotalIssues(filteredResults.violations)} issues (tags: ${tags.join(', ')})`
        )
      }

      return {
        accessibilityResults,
        filteredResults,
        appliedFilters,
      }
    } catch (error) {
      console.error('Error running accessibility test:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      throw new Error(`Accessibility test failed for ${url}: ${errorMessage}`)
    }
  }
}
