/**
 * Result Processor - Formats accessibility results into conversational, actionable format
 * Converts raw accessibility results into structured, prioritized, and human-readable format
 */

import type {
  AccessibilityResults,
  AccessibilityReport,
  AuditResult,
  AuditSummary,
  PrioritizedIssue,
  QuickWin,
  CriticalBlocker,
  WCAGCompliance,
  ImpactLevel,
  AppliedFilters,
  TestMetadata,
} from '../types/index.js'
import { IMPACT_ORDER } from '../types/index.js'

/** Options passed when processing audit results (e.g. WCAG label used for the audit) */
export interface ProcessOptions {
  /** WCAG version and level used for the audit (e.g. "WCAG 2.2 AA"). Used when rule tags are empty. */
  auditWcagLabel?: string
}

/**
 * Derive full WCAG label from engine tags (e.g. wcag22aa -> "WCAG 2.2 AA").
 * Used for display and for audit fallback.
 */
export function getWcagLabelFromTags(tags: string[]): string {
  if (!tags || tags.length === 0) return 'N/A'
  const level = tags.some((t) => t.endsWith('aaa')) ? 'AAA'
    : tags.some((t) => t.endsWith('aa')) ? 'AA'
    : tags.some((t) => t.endsWith('a')) ? 'A'
    : null
  if (!level) return 'N/A'
  if (tags.some((t) => t.startsWith('wcag22'))) return `WCAG 2.2 ${level}`
  if (tags.some((t) => t.startsWith('wcag21'))) return `WCAG 2.1 ${level}`
  if (tags.some((t) => t.startsWith('wcag2'))) return `WCAG 2.0 ${level}`
  return `WCAG ${level}`
}

/** True if wcagLevel string matches the given level (A, AA, AAA); supports full label e.g. "WCAG 2.2 AA". */
export function wcagLevelMatches(level: string, target: 'A' | 'AA' | 'AAA'): boolean {
  if (target === 'AAA') return level === 'AAA' || level.endsWith(' AAA')
  if (target === 'AA') return level === 'AA' || (level.endsWith(' AA') && !level.endsWith(' AAA'))
  return level === 'A' || (level.endsWith(' A') && !level.endsWith(' AA'))
}

/** Numeric order for sorting by WCAG level (A=3, AA=2, AAA=1). Supports full label e.g. "WCAG 2.2 AA". */
export function wcagLevelOrder(level: string): number {
  if (wcagLevelMatches(level, 'A')) return 3
  if (wcagLevelMatches(level, 'AA')) return 2
  if (wcagLevelMatches(level, 'AAA')) return 1
  return 0
}

/**
 * ResultProcessor class - Formats and processes accessibility results
 */
export class ResultProcessor {
  /**
   * Get WCAG level for display (full label e.g. "WCAG 2.2 AA"). Uses tags when present, else audit fallback.
   */
  private getWCAGLevel(tags: string[], auditWcagLabel?: string): string {
    if (tags && tags.length > 0) return getWcagLabelFromTags(tags)
    return auditWcagLabel ?? 'N/A'
  }

  /**
   * Determine impact level from engine-reported impact (axe or ACE native levels).
   */
  private getImpactLevel(
    _category: string,
    _ruleId: string,
    ruleData?: { impact?: ImpactLevel }
  ): ImpactLevel {
    return ruleData?.impact ?? 'moderate'
  }

  /**
   * Get impact rank for ordering (higher = worse). Uses IMPACT_ORDER.
   */
  private impactRank(impact: ImpactLevel): number {
    return IMPACT_ORDER[impact.toLowerCase()] ?? 2
  }

  /**
   * Calculate priority score for an issue (higher = more important)
   */
  private calculatePriority(issue: PrioritizedIssue): number {
    let priority = 0

    // Impact weighting (axe: critical/serious/moderate/minor; ACE: violation/potentialviolation/...)
    priority += this.impactRank(issue.impact) * 25

    // WCAG level weighting (AAA > AA > A); support full label e.g. "WCAG 2.2 AA"
    const level = issue.wcagLevel
    if (level.endsWith('AAA')) priority += 30
    else if (level.endsWith('AA')) priority += 20
    else if (level.endsWith('A')) priority += 10

    return priority
  }

  /**
   * Generate fix suggestion for an issue
   */
  private generateFixSuggestion(
    ruleId: string,
    _category: string,
    element: string,
    xpath: string,
    domInfo?: any
  ): { current: string; suggested: string; explanation: string } {
    const currentCode = domInfo?.innerHTML || element || xpath
    let suggested = currentCode
    let explanation = ''

    // Generate fix suggestions based on rule type
    if (ruleId.includes('alt_missing') || ruleId.includes('alt_link_missing')) {
      suggested = currentCode.replace(/<img([^>]*)>/i, '<img$1 alt="Descriptive text here">')
      explanation = 'Add descriptive alt text to image elements. Alt text should describe the image content or function.'
    } else if (ruleId.includes('label_missing') || ruleId.includes('label_empty')) {
      if (currentCode.includes('<input')) {
        suggested = currentCode.replace(
          /<input([^>]*)>/i,
          '<label for="input-id">Label text</label><input id="input-id"$1>'
        )
        explanation = 'Add a label element associated with the input using the "for" attribute matching the input "id".'
      }
    } else if (ruleId === 'contrast') {
      explanation = 'Improve color contrast ratio. Text should have a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text (WCAG AA).'
    } else if (ruleId.includes('heading')) {
      explanation = 'Ensure headings are not empty and follow a logical hierarchy (h1 → h2 → h3, etc.).'
    } else if (ruleId.includes('link_empty')) {
      explanation = 'Add descriptive link text. Links should clearly indicate their destination or purpose.'
    } else {
      explanation = `Fix ${ruleId} issue. See accessibility documentation for specific guidance.`
    }

    return {
      current: currentCode.substring(0, 200), // Limit length
      suggested: suggested.substring(0, 200),
      explanation,
    }
  }

  /**
   * Generate user impact description from engine-native impact level.
   */
  private generateUserImpact(_ruleId: string, impact: ImpactLevel): string {
    const rank = this.impactRank(impact)
    if (rank >= 5) {
      return 'This is a definite or likely accessibility failure that prevents users with disabilities from accessing content or functionality.'
    }
    if (rank >= 4) {
      return 'This potential issue needs manual review — it may significantly impact users with disabilities.'
    }
    if (rank >= 3) {
      return 'This is a best-practice recommendation that improves accessibility for users with disabilities.'
    }
    return 'This may cause minor inconveniences for some users.'
  }

  /**
   * Process accessibility violations into prioritized issues
   */
  private processViolations(
    violations: AccessibilityReport,
    _appliedFilters?: AppliedFilters,
    options?: ProcessOptions
  ): PrioritizedIssue[] {
    const issues: PrioritizedIssue[] = []
    const auditWcagLabel = options?.auditWcagLabel

    Object.entries(violations).forEach(([categoryKey, category]) => {
      if (!category || !category.items) {
        return
      }

      Object.entries(category.items).forEach(([ruleId, ruleData]) => {
        if (!ruleData || ruleData.count === 0) {
          return
        }

        // Process each instance of the violation
        const xpaths = ruleData.xpaths || []
        const domInfoArray = ruleData.domInfo || []

        xpaths.forEach((xpath, index) => {
          const domInfo = domInfoArray[index]
          const element = domInfo
            ? `${domInfo.tagName || 'Unknown'}${domInfo.id ? `#${domInfo.id}` : ''}${domInfo.className ? `.${domInfo.className.replace(/\s+/g, '.')}` : ''}`
            : xpath
          // Build a selector that identifies the exact element: tag + optional id + optional classes.
          // Never leave empty: use tag when no class/id so the column always has a value.
          const tag = domInfo?.tagName || 'element'
          const idPart = domInfo?.id ? `#${domInfo.id}` : ''
          const classPart =
            domInfo?.className != null && domInfo.className !== ''
              ? '.' + String(domInfo.className).trim().replace(/\s+/g, '.')
              : ''
          const classSelector = tag + idPart + classPart

          const tags = ruleData.tags || []
          const wcagLevel = this.getWCAGLevel(tags, auditWcagLabel)
          const impact = this.getImpactLevel(categoryKey, ruleId, ruleData)
          const fix = this.generateFixSuggestion(
            ruleId,
            categoryKey,
            element,
            xpath,
            domInfo
          )
          const userImpact = this.generateUserImpact(ruleId, impact)

          const issue: PrioritizedIssue = {
            ruleId,
            impact,
            description: ruleData.description || ruleId,
            wcagLevel,
            tags,
            element,
            xpath,
            classSelector,
            fix,
            userImpact,
            priority: 0, // Will be calculated after all issues are collected
            category: categoryKey,
            helpUrl: `https://webaim.org/resources/help/`,
          }

          issues.push(issue)
        })
      })
    })

    // Calculate priorities
    issues.forEach((issue) => {
      issue.priority = this.calculatePriority(issue)
    })

    // Sort by priority (highest first)
    issues.sort((a, b) => b.priority - a.priority)

    return issues
  }

  /**
   * Calculate accessibility score (0-100)
   */
  private calculateScore(issues: PrioritizedIssue[]): number {
    if (issues.length === 0) {
      return 100
    }

    // Base score starts at 100
    let score = 100

    // Deduct points based on impact (axe/ACE native levels via IMPACT_ORDER)
    issues.forEach((issue) => {
      const rank = this.impactRank(issue.impact)
      if (rank >= 5) score -= 5
      else if (rank >= 4) score -= 3
      else if (rank >= 3) score -= 1
      else score -= 0.5
    })

    // Ensure score doesn't go below 0
    return Math.max(0, Math.round(score))
  }

  /**
   * Calculate WCAG compliance percentages
   */
  private calculateWCAGCompliance(issues: PrioritizedIssue[]): WCAGCompliance {
    const levelA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'A'))
    const levelAA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AA'))
    const levelAAA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AAA'))

    // Calculate compliance as percentage (100% - violation percentage)
    // This is a simplified calculation - in reality, we'd need to know total criteria
    const totalIssues = issues.length
    const complianceA = totalIssues > 0 ? Math.max(0, 100 - (levelA.length / totalIssues) * 100) : 100
    const complianceAA = totalIssues > 0 ? Math.max(0, 100 - (levelAA.length / totalIssues) * 100) : 100
    const complianceAAA = totalIssues > 0 ? Math.max(0, 100 - (levelAAA.length / totalIssues) * 100) : 100

    return {
      A: Math.round(complianceA),
      AA: Math.round(complianceAA),
      AAA: Math.round(complianceAAA),
    }
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    issues: PrioritizedIssue[],
    score: number,
    wcagCompliance: WCAGCompliance
  ): AuditSummary {
    const byCategory: Record<string, number> = {}
    const byImpact: Record<string, number> = {}

    issues.forEach((issue) => {
      // Count by category
      const category = issue.category || 'unknown'
      byCategory[category] = (byCategory[category] || 0) + 1

      // Count by impact
      byImpact[issue.impact] = (byImpact[issue.impact] || 0) + 1
    })

    return {
      totalIssues: issues.length,
      score,
      wcagCompliance,
      byCategory,
      byImpact,
    }
  }

  /**
   * Identify quick wins (easy fixes with high impact)
   */
  private identifyQuickWins(issues: PrioritizedIssue[]): QuickWin[] {
    const quickWins: QuickWin[] = []

    // Group issues by rule ID
    const ruleGroups = new Map<string, PrioritizedIssue[]>()
    issues.forEach((issue) => {
      if (!ruleGroups.has(issue.ruleId)) {
        ruleGroups.set(issue.ruleId, [])
      }
      ruleGroups.get(issue.ruleId)!.push(issue)
    })

    ruleGroups.forEach((groupIssues, ruleId) => {
      // Quick wins are issues that:
      // 1. Have high impact (axe: critical/serious; ACE: violation/potentialviolation)
      // 2. Are easy to fix (have clear fix suggestions)
      // 3. Affect multiple elements (batch fix opportunity)
      const highImpactIssues = groupIssues.filter((i) => this.impactRank(i.impact) >= 5)

      if (highImpactIssues.length > 0 && groupIssues.length > 1) {
        const firstIssue = groupIssues[0]
        quickWins.push({
          ruleId,
          description: firstIssue.description,
          impact: firstIssue.impact,
          fix: firstIssue.fix,
          estimatedTime: `${Math.ceil(groupIssues.length * 2)} minutes`,
          affectedElements: groupIssues.length,
        })
      }
    })

    // Sort by impact and number of affected elements
    quickWins.sort((a, b) => {
      const impactDiff = this.impactRank(b.impact) - this.impactRank(a.impact)
      if (impactDiff !== 0) return impactDiff
      return b.affectedElements - a.affectedElements
    })

    return quickWins.slice(0, 10) // Top 10 quick wins
  }

  /**
   * Identify critical blockers (must fix before launch)
   */
  private identifyCriticalBlockers(issues: PrioritizedIssue[]): CriticalBlocker[] {
    const blockers: CriticalBlocker[] = []

    // Group by rule ID
    const ruleGroups = new Map<string, PrioritizedIssue[]>()
    issues.forEach((issue) => {
      if (!ruleGroups.has(issue.ruleId)) {
        ruleGroups.set(issue.ruleId, [])
      }
      ruleGroups.get(issue.ruleId)!.push(issue)
    })

    ruleGroups.forEach((groupIssues, ruleId) => {
      // Critical blockers: high impact (axe critical/serious; ACE violation/potentialviolation) or WCAG Level A
      const highImpactIssues = groupIssues.filter((i) => this.impactRank(i.impact) >= 5)
      const levelAIssues = groupIssues.filter((i) => wcagLevelMatches(i.wcagLevel, 'A'))

      if (highImpactIssues.length > 0 || levelAIssues.length > 0) {
        const firstIssue = groupIssues[0]
        blockers.push({
          ruleId,
          description: firstIssue.description,
          impact: firstIssue.impact,
          userImpact: firstIssue.userImpact,
          affectedElements: groupIssues.length,
          wcagLevel: firstIssue.wcagLevel,
        })
      }
    })

    // Sort by WCAG level (A first) then impact rank
    blockers.sort((a, b) => {
      const levelDiff = wcagLevelOrder(b.wcagLevel) - wcagLevelOrder(a.wcagLevel)
      if (levelDiff !== 0) return levelDiff
      return this.impactRank(b.impact) - this.impactRank(a.impact)
    })

    return blockers
  }

  /**
   * Generate conversational summary
   */
  private generateConversationalSummary(
    summary: AuditSummary,
    _issues: PrioritizedIssue[],
    quickWins: QuickWin[],
    blockers: CriticalBlocker[],
    appliedFilters?: AppliedFilters
  ): string {
    const parts: string[] = []

    // Opening
    if (summary.totalIssues === 0) {
      const totalBefore = appliedFilters?.originalIssueCount
      if (totalBefore != null && totalBefore > 0) {
        const tagList = (appliedFilters?.tags ?? []).join(', ')
        return `Tag filter applied: ${totalBefore} issue${totalBefore !== 1 ? 's' : ''} found, but 0 match your selected tags (${tagList}). Try running without tags to see all issues.`
      }
      return "🎉 Excellent! No accessibility issues found. This page meets WCAG accessibility standards."
    }

    parts.push(`Found ${summary.totalIssues} accessibility issue${summary.totalIssues !== 1 ? 's' : ''} on this page.`)
    const totalBefore = appliedFilters?.originalIssueCount
    if (totalBefore != null && totalBefore > summary.totalIssues) {
      parts.push(`(${totalBefore} issues before tag filter; showing those matching your selected tags.)`)
    }

    // Score
    if (summary.score >= 80) {
      parts.push(`Accessibility score: ${summary.score}/100 (Good)`)
    } else if (summary.score >= 60) {
      parts.push(`Accessibility score: ${summary.score}/100 (Needs Improvement)`)
    } else {
      parts.push(`Accessibility score: ${summary.score}/100 (Critical)`)
    }

    // Critical blockers
    if (blockers.length > 0) {
      parts.push(`\n🚨 ${blockers.length} critical blocker${blockers.length !== 1 ? 's' : ''} must be fixed before launch.`)
    }

    // Quick wins
    if (quickWins.length > 0) {
      parts.push(`\n✨ ${quickWins.length} quick win${quickWins.length !== 1 ? 's' : ''} available - these are easy fixes that will have high impact.`)
    }

    // Severity breakdown aligned with IBM Equal Access browser tool
    if (summary.byImpact['violation']) {
      parts.push(`\n🚫 Violations: ${summary.byImpact['violation']}`)
    }
    if (summary.byImpact['needs-review']) {
      parts.push(`⚠️  Needs review: ${summary.byImpact['needs-review']}`)
    }
    if (summary.byImpact['recommendation']) {
      parts.push(`ℹ️  Recommendations: ${summary.byImpact['recommendation']}`)
    }
    if (summary.byImpact['minor']) {
      parts.push(`Minor: ${summary.byImpact['minor']}`)
    }

    // WCAG compliance
    parts.push(`\nWCAG Compliance: Level A: ${summary.wcagCompliance.A}%, Level AA: ${summary.wcagCompliance.AA}%, Level AAA: ${summary.wcagCompliance.AAA}%`)

    // Category breakdown
    const categoryEntries = Object.entries(summary.byCategory)
    if (categoryEntries.length > 0) {
      parts.push(`\nIssues by category: ${categoryEntries.map(([cat, count]) => `${cat}: ${count}`).join(', ')}`)
    }

    return parts.join('\n')
  }

  /**
   * Generate a markdown table summarising all prioritised issues.
   * Columns: Severity | Rule ID | Description | WCAG | Element / XPath | Fix hint
   */
  private generateIssuesTable(issues: PrioritizedIssue[]): string {
    if (issues.length === 0) {
      return '| Severity | Rule | Description | WCAG | Element |\n|---|---|---|---|---|\n| — | — | No issues found | — | — |'
    }

    const severityIcon = (impact: string): string => {
      const rank = IMPACT_ORDER[impact.toLowerCase()] ?? 2
      if (rank >= 5) return `🚫 ${impact}`
      if (rank >= 4) return `⚠️ ${impact}`
      if (rank >= 3) return `ℹ️ ${impact}`
      return impact
    }

    const truncate = (s: string, max = 80): string =>
      s.length > max ? s.substring(0, max - 1) + '…' : s

    const escape = (s: string): string =>
      s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

    const header = '| # | Severity | Rule ID | Description | WCAG | Element |'
    const divider = '|---|---|---|---|---|---|'

    const rows = issues.map((issue, i) => {
      const num = String(i + 1)
      const severity = severityIcon(issue.impact)
      const ruleId = `\`${escape(issue.ruleId)}\``
      const description = escape(truncate(issue.description))
      const wcag = issue.wcagLevel || 'N/A'
      // Use selector from domInfo if available, fall back to xpath
      const element = escape(truncate(issue.xpath || issue.element || '—', 60))
      return `| ${num} | ${severity} | ${ruleId} | ${description} | ${wcag} | ${element} |`
    })

    return [header, divider, ...rows].join('\n')
  }

  /**
   * Process accessibility results into structured audit result
   */
  process(
    accessibilityResults: AccessibilityResults,
    appliedFilters?: AppliedFilters,
    options?: ProcessOptions
  ): AuditResult {
    // Use filtered results if available, otherwise use original
    const violations = accessibilityResults.violations

    // Process violations into prioritized issues
    const issues = this.processViolations(violations, appliedFilters, options)

    // Calculate metrics
    const score = this.calculateScore(issues)
    const wcagCompliance = this.calculateWCAGCompliance(issues)
    const summary = this.generateSummary(issues, score, wcagCompliance)

    // Identify quick wins and blockers
    const quickWins = this.identifyQuickWins(issues)
    const criticalBlockers = this.identifyCriticalBlockers(issues)

    // Generate conversational summary
    const conversationalSummary = this.generateConversationalSummary(
      summary,
      issues,
      quickWins,
      criticalBlockers,
      appliedFilters
    )

    // Extract metadata
    const metadata: TestMetadata = {
      testEngine: accessibilityResults.testEngine,
      testRunner: accessibilityResults.testRunner,
      testEnvironment: accessibilityResults.testEnvironment,
      timestamp: accessibilityResults.timestamp,
      url: accessibilityResults.url,
    }

    // Generate issues table
    const issuesTable = this.generateIssuesTable(issues)

    return {
      summary,
      prioritizedIssues: issues,
      appliedFilters,
      conversationalSummary,
      issuesTable,
      quickWins,
      criticalBlockers,
      metadata,
      rawResults: accessibilityResults,
    }
  }
}
