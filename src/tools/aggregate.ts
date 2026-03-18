/**
 * Aggregation & statistics tools
 * Implements: aggregate_audit_results, get_statistics
 */

import { normalizeAuditResult } from '../core/normalize-audit-result.js'
import type {
  AuditResult,
  AuditSummary,
  PrioritizedIssue,
  WCAGCompliance,
  AggregateAuditResultsInput,
  AggregateAuditResultsResult,
  GetStatisticsInput,
  GetStatisticsResult,
  StatisticsBreakdown,
  BreakdownDimension,
} from '../types/index.js'
import { IMPACT_ORDER } from '../types/index.js'
import { wcagLevelMatches } from '../core/result-processor.js'

/** Safely get prioritizedIssues from a result (handles missing or non-array from external tools). */
function getPrioritizedIssues(result: unknown): PrioritizedIssue[] {
  if (result == null || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  const issues = r.prioritizedIssues
  return Array.isArray(issues) ? (issues as PrioritizedIssue[]) : []
}

/** Safely get summary from a result for WCAG compliance. */
function getSummary(result: unknown): AuditSummary | undefined {
  if (result == null || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  const s = r.summary
  return s != null && typeof s === 'object' ? (s as AuditSummary) : undefined
}

/**
 * Calculate WCAG compliance from issues
 */
function calculateWCAGCompliance(issues: PrioritizedIssue[]): WCAGCompliance {
  if (issues.length === 0) {
    return { A: 100, AA: 100, AAA: 100 }
  }

  const levelA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'A'))
  const levelAA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AA'))
  const levelAAA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AAA'))

  const totalIssues = issues.length
  const complianceA = totalIssues > 0
    ? Math.max(0, Math.round(100 - (levelA.length / totalIssues) * 100))
    : 100
  const complianceAA = totalIssues > 0
    ? Math.max(0, Math.round(100 - (levelAA.length / totalIssues) * 100))
    : 100
  const complianceAAA = totalIssues > 0
    ? Math.max(0, Math.round(100 - (levelAAA.length / totalIssues) * 100))
    : 100

  return {
    A: complianceA,
    AA: complianceAA,
    AAA: complianceAAA,
  }
}

/**
 * Calculate accessibility score from issues
 */
function calculateScore(issues: PrioritizedIssue[]): number {
  if (issues.length === 0) {
    return 100
  }

  let score = 100
  issues.forEach((issue) => {
    const rank = IMPACT_ORDER[issue.impact?.toLowerCase() ?? ''] ?? 2
    if (rank >= 5) score -= 5
    else if (rank >= 4) score -= 3
    else if (rank >= 3) score -= 1
    else score -= 0.5
  })

  return Math.max(0, Math.round(score))
}

/**
 * Generate summary from issues
 */
function generateSummary(issues: PrioritizedIssue[]): AuditSummary {
  const byCategory: Record<string, number> = {}
  const byImpact: Record<string, number> = {}

  issues.forEach((issue) => {
    const category = issue.category || 'unknown'
    byCategory[category] = (byCategory[category] || 0) + 1
    byImpact[issue.impact] = (byImpact[issue.impact] || 0) + 1
  })

  const score = calculateScore(issues)
  const wcagCompliance = calculateWCAGCompliance(issues)

  return {
    totalIssues: issues.length,
    score,
    wcagCompliance,
    byCategory,
    byImpact,
  }
}

/**
 * Group issues by URL
 */
function groupIssuesByUrl(
  results: unknown[]
): Record<string, PrioritizedIssue[]> {
  const grouped: Record<string, PrioritizedIssue[]> = {}

  results.forEach((result) => {
    const url =
      (result != null && typeof result === 'object' && (result as Record<string, unknown>).metadata != null && typeof (result as Record<string, unknown>).metadata === 'object')
        ? ((result as Record<string, unknown>).metadata as Record<string, unknown>).url
        : undefined
    const urlStr = typeof url === 'string' ? url : 'unknown'
    if (!grouped[urlStr]) {
      grouped[urlStr] = []
    }
    grouped[urlStr].push(...getPrioritizedIssues(result))
  })

  return grouped
}

/**
 * Group issues by category
 */
function groupIssuesByCategory(
  issues: PrioritizedIssue[]
): Record<string, PrioritizedIssue[]> {
  const grouped: Record<string, PrioritizedIssue[]> = {}

  issues.forEach((issue) => {
    const category = issue.category || 'unknown'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(issue)
  })

  return grouped
}

/**
 * Group issues by rule ID
 */
function groupIssuesByRule(
  issues: PrioritizedIssue[]
): Record<string, PrioritizedIssue[]> {
  const grouped: Record<string, PrioritizedIssue[]> = {}

  issues.forEach((issue) => {
    if (!grouped[issue.ruleId]) {
      grouped[issue.ruleId] = []
    }
    grouped[issue.ruleId].push(issue)
  })

  return grouped
}

/**
 * aggregate_audit_results - Combine and aggregate multiple audit results
 *
 * Combines multiple audit results into a single aggregated result with
 * combined statistics and optional grouping by URL, category, or rule.
 *
 * @param input - Aggregation input (results array, groupBy, includeSummary)
 * @returns Aggregated result with combined statistics and grouped issues
 */
export function aggregateAuditResults(
  input: AggregateAuditResultsInput
): AggregateAuditResultsResult {
  const {
    results,
    groupBy = 'url',
    includeSummary = true,
  } = input

  const rawArray = Array.isArray(results) ? results : results != null ? [results] : []
  if (rawArray.length === 0) {
    throw new Error('At least one audit result is required')
  }

  // Normalize each result (handles JSON string, MCP wrapper, partial object)
  const resultsArray = rawArray.map((r) => normalizeAuditResult(r) ?? r)

  // Combine all issues from all results (safe when prioritizedIssues is missing or not an array)
  const allIssues: PrioritizedIssue[] = []
  resultsArray.forEach((result) => {
    allIssues.push(...getPrioritizedIssues(result))
  })

  // Group issues based on groupBy strategy
  let groupedIssues: Record<string, PrioritizedIssue[]> | undefined

  if (groupBy === 'url') {
    groupedIssues = groupIssuesByUrl(resultsArray)
  } else if (groupBy === 'category') {
    groupedIssues = groupIssuesByCategory(allIssues)
  } else if (groupBy === 'rule') {
    groupedIssues = groupIssuesByRule(allIssues)
  }
  // If groupBy is 'none', groupedIssues remains undefined

  // Generate aggregated summary
  const summary = includeSummary ? generateSummary(allIssues) : {
    totalIssues: allIssues.length,
    score: calculateScore(allIssues),
    wcagCompliance: calculateWCAGCompliance(allIssues),
    byCategory: {},
    byImpact: {},
  }

  // If includeSummary is true, populate byCategory and byImpact
  if (includeSummary) {
    const byCategory: Record<string, number> = {}
    const byImpact: Record<string, number> = {}

    allIssues.forEach((issue) => {
      const category = issue.category || 'unknown'
      byCategory[category] = (byCategory[category] || 0) + 1
      byImpact[issue.impact] = (byImpact[issue.impact] || 0) + 1
    })

    summary.byCategory = byCategory
    summary.byImpact = byImpact
  }

  // Create aggregated audit result
  // Use metadata from the first result as a base, or create a combined one
  const firstResult = resultsArray[0] as unknown
  const firstMeta =
    firstResult != null &&
    typeof firstResult === 'object' &&
    (firstResult as Record<string, unknown>).metadata != null &&
    typeof (firstResult as Record<string, unknown>).metadata === 'object'
      ? ((firstResult as Record<string, unknown>).metadata as AuditResult['metadata'])
      : undefined
  const aggregatedResult: AuditResult = {
    summary,
    prioritizedIssues: allIssues,
    conversationalSummary: `Aggregated ${resultsArray.length} audit result(s) with ${allIssues.length} total issue(s). ${summary.score}/100 accessibility score.`,
    issuesTable: '',
    quickWins: [],
    criticalBlockers: [],
    metadata: firstMeta,
  }

  return {
    aggregated: aggregatedResult,
    groupedBy: groupBy,
    totalResults: resultsArray.length,
    groupedIssues,
    summary,
  }
}

/**
 * Calculate statistics breakdown by dimension
 */
function calculateBreakdown(
  issues: PrioritizedIssue[],
  dimension: BreakdownDimension
): StatisticsBreakdown {
  const counts: Record<string, number> = {}
  const total = issues.length

  issues.forEach((issue) => {
    let key: string

    switch (dimension) {
      case 'category':
        key = issue.category || 'unknown'
        break
      case 'impact':
        key = issue.impact
        break
      case 'wcag':
        key = issue.wcagLevel || 'N/A'
        break
      case 'rule':
        key = issue.ruleId
        break
      default:
        key = 'unknown'
    }

    counts[key] = (counts[key] || 0) + 1
  })

  // Calculate percentages
  const percentages: Record<string, number> = {}
  Object.entries(counts).forEach(([key, count]) => {
    percentages[key] = total > 0 ? Math.round((count / total) * 100) : 0
  })

  // Calculate distribution (normalized to 0-1)
  const distribution: Record<string, number> = {}
  Object.entries(counts).forEach(([key, count]) => {
    distribution[key] = total > 0 ? count / total : 0
  })

  return {
    counts,
    percentages,
    distribution,
  }
}

/**
 * Calculate average WCAG compliance from multiple results
 */
function calculateAverageWCAGCompliance(
  results: unknown[]
): WCAGCompliance {
  if (results.length === 0) {
    return { A: 100, AA: 100, AAA: 100 }
  }

  let totalA = 0
  let totalAA = 0
  let totalAAA = 0

  results.forEach((result) => {
    const s = getSummary(result)
    const wcag = s?.wcagCompliance as WCAGCompliance | undefined
    totalA += typeof wcag?.A === 'number' ? wcag.A : 100
    totalAA += typeof wcag?.AA === 'number' ? wcag.AA : 100
    totalAAA += typeof wcag?.AAA === 'number' ? wcag.AAA : 100
  })

  return {
    A: Math.round(totalA / results.length),
    AA: Math.round(totalAA / results.length),
    AAA: Math.round(totalAAA / results.length),
  }
}

/**
 * get_statistics - Generate detailed statistics from audit results
 *
 * Generates comprehensive statistics from audit results with optional
 * breakdowns by category, impact, WCAG level, or rule ID.
 *
 * @param input - Statistics input (results or array, breakdown dimensions)
 * @returns Statistics object with counts, percentages, and distributions
 */
export function getStatistics(
  input: GetStatisticsInput
): GetStatisticsResult {
  const {
    results,
    breakdown = ['category', 'impact', 'wcag', 'rule'],
  } = input

  // Normalize input to array and normalize each element
  const rawArray = Array.isArray(results) ? results : [results]
  if (rawArray.length === 0) {
    throw new Error('At least one audit result is required')
  }
  const resultsArray = rawArray.map((r) => normalizeAuditResult(r) ?? r)

  // Combine all issues (safe when prioritizedIssues is missing or not an array)
  const allIssues: PrioritizedIssue[] = []
  resultsArray.forEach((result) => {
    allIssues.push(...getPrioritizedIssues(result))
  })

  // Calculate total issues
  const totalIssues = allIssues.length

  // Calculate average score (safe when summary is missing)
  const totalScore = resultsArray.reduce((sum, result) => {
    const s = getSummary(result)
    return sum + (s?.score ?? 100)
  }, 0)
  const averageScore = resultsArray.length > 0
    ? Math.round(totalScore / resultsArray.length)
    : 100

  // Calculate average WCAG compliance
  const wcagCompliance = calculateAverageWCAGCompliance(resultsArray)

  // Calculate breakdowns for requested dimensions
  const byCategory = breakdown.includes('category')
    ? calculateBreakdown(allIssues, 'category')
    : undefined

  const byImpact = breakdown.includes('impact')
    ? calculateBreakdown(allIssues, 'impact')
    : undefined

  const byWCAG = breakdown.includes('wcag')
    ? calculateBreakdown(allIssues, 'wcag')
    : undefined

  const byRule = breakdown.includes('rule')
    ? calculateBreakdown(allIssues, 'rule')
    : undefined

  return {
    totalIssues,
    averageScore,
    totalResults: resultsArray.length,
    byCategory,
    byImpact,
    byWCAG,
    byRule,
    wcagCompliance,
    breakdownDimensions: breakdown,
  }
}
