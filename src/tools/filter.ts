/**
 * Filtering and search tools for audit results
 * Implements: filter_issues, search_issues
 */

import { normalizeAuditResult } from '../core/normalize-audit-result.js'
import type {
  AuditResult,
  PrioritizedIssue,
  FilterIssuesInput,
  FilterIssuesResult,
  SearchIssuesInput,
  SearchIssuesResult,
  ImpactLevel,
} from '../types/index.js'
import { wcagLevelMatches } from '../core/result-processor.js'

/**
 * filter_issues - Filter issues from audit results by various criteria
 * 
 * Filters issues from audit results based on rule IDs, categories, impact levels,
 * WCAG levels, minimum count, and element types. Supports include/exclude modes.
 * 
 * @param input - Filter configuration
 * @returns Filtered audit result object
 */
export function filterIssues(
  input: FilterIssuesInput
): FilterIssuesResult {
  const {
    results,
    filters,
    mode = 'include',
  } = input

  // Normalize: accept result object, JSON string, or MCP wrapper
  const normalized = normalizeAuditResult(results)
  const auditResult = normalized ?? (results != null && typeof results === 'object' ? results : ({} as AuditResult))
  const prioritizedIssues = Array.isArray(auditResult.prioritizedIssues)
    ? auditResult.prioritizedIssues
    : []

  let filteredIssues = [...prioritizedIssues]

  // Apply filters
  if (filters.ruleIds && filters.ruleIds.length > 0) {
    if (mode === 'include') {
      filteredIssues = filteredIssues.filter((issue) =>
        filters.ruleIds!.includes(issue.ruleId)
      )
    } else {
      filteredIssues = filteredIssues.filter(
        (issue) => !filters.ruleIds!.includes(issue.ruleId)
      )
    }
  }

  if (filters.categories && filters.categories.length > 0) {
    if (mode === 'include') {
      filteredIssues = filteredIssues.filter(
        (issue) =>
          issue.category && filters.categories!.includes(issue.category)
      )
    } else {
      filteredIssues = filteredIssues.filter(
        (issue) =>
          !issue.category || !filters.categories!.includes(issue.category)
      )
    }
  }

  if (filters.impactLevels && filters.impactLevels.length > 0) {
    if (mode === 'include') {
      filteredIssues = filteredIssues.filter((issue) =>
        filters.impactLevels!.includes(issue.impact as ImpactLevel)
      )
    } else {
      filteredIssues = filteredIssues.filter(
        (issue) => !filters.impactLevels!.includes(issue.impact as ImpactLevel)
      )
    }
  }

  if (filters.wcagLevels && filters.wcagLevels.length > 0) {
    const matchesWcag = (issue: PrioritizedIssue) =>
      filters.wcagLevels!.some((level) => wcagLevelMatches(issue.wcagLevel, level as 'A' | 'AA' | 'AAA'))
    if (mode === 'include') {
      filteredIssues = filteredIssues.filter(matchesWcag)
    } else {
      filteredIssues = filteredIssues.filter((issue) => !matchesWcag(issue))
    }
  }

  if (filters.minCount !== undefined) {
    // Group by rule ID and count occurrences
    const ruleCounts = new Map<string, number>()
    filteredIssues.forEach((issue) => {
      ruleCounts.set(issue.ruleId, (ruleCounts.get(issue.ruleId) || 0) + 1)
    })

    filteredIssues = filteredIssues.filter((issue) => {
      const count = ruleCounts.get(issue.ruleId) || 0
      return count >= filters.minCount!
    })
  }

  if (filters.elementTypes && filters.elementTypes.length > 0) {
    if (mode === 'include') {
      filteredIssues = filteredIssues.filter((issue) => {
        const elementTag = issue.element.split(/[#.]/)[0].toLowerCase()
        return filters.elementTypes!.some((type) =>
          elementTag.includes(type.toLowerCase())
        )
      })
    } else {
      filteredIssues = filteredIssues.filter((issue) => {
        const elementTag = issue.element.split(/[#.]/)[0].toLowerCase()
        return !filters.elementTypes!.some((type) =>
          elementTag.includes(type.toLowerCase())
        )
      })
    }
  }

  // Recalculate summary statistics for filtered results
  const byCategory: Record<string, number> = {}
  const byImpact: Record<string, number> = {}
  const wcagCompliance = { A: 0, AA: 0, AAA: 0 }

  filteredIssues.forEach((issue) => {
    // Count by category
    const category = issue.category || 'unknown'
    byCategory[category] = (byCategory[category] || 0) + 1

    // Count by impact
    byImpact[issue.impact] = (byImpact[issue.impact] || 0) + 1
  })

  // Calculate WCAG compliance (simplified - based on issues found)
  const totalIssues = filteredIssues.length
  const levelA = filteredIssues.filter((i) => wcagLevelMatches(i.wcagLevel, 'A')).length
  const levelAA = filteredIssues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AA')).length
  const levelAAA = filteredIssues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AAA')).length

  wcagCompliance.A = totalIssues > 0
    ? Math.max(0, Math.round(100 - (levelA / totalIssues) * 100))
    : 100
  wcagCompliance.AA = totalIssues > 0
    ? Math.max(0, Math.round(100 - (levelAA / totalIssues) * 100))
    : 100
  wcagCompliance.AAA = totalIssues > 0
    ? Math.max(0, Math.round(100 - (levelAAA / totalIssues) * 100))
    : 100

  // Calculate score (simplified calculation)
  let score = 100
  filteredIssues.forEach((issue) => {
    switch (issue.impact) {
      case 'violation':
        score -= 5
        break
      case 'needs-review':
        score -= 3
        break
      case 'recommendation':
        score -= 1
        break
      case 'minor':
        score -= 0.5
        break
    }
  })
  score = Math.max(0, Math.round(score))

  const quickWins = Array.isArray(auditResult.quickWins) ? auditResult.quickWins : []
  const criticalBlockers = Array.isArray(auditResult.criticalBlockers) ? auditResult.criticalBlockers : []
  const originalTotalIssues = auditResult.summary?.totalIssues ?? prioritizedIssues.length

  // Create filtered audit result
  const filteredResult: AuditResult = {
    ...auditResult,
    summary: {
      totalIssues: filteredIssues.length,
      score,
      wcagCompliance,
      byCategory,
      byImpact,
    },
    prioritizedIssues: filteredIssues,
    quickWins: quickWins.filter((qw) =>
      filteredIssues.some((issue) => issue.ruleId === qw.ruleId)
    ),
    criticalBlockers: criticalBlockers.filter((cb) =>
      filteredIssues.some((issue) => issue.ruleId === cb.ruleId)
    ),
  }

  return {
    filtered: filteredResult,
    originalCount: originalTotalIssues,
    filteredCount: filteredIssues.length,
    filtersApplied: filters,
    mode,
  }
}

/**
 * search_issues - Search issues by text content, selector, or XPath
 * 
 * Searches issues by text content, selector, XPath, or description.
 * Supports case-sensitive and case-insensitive search.
 * 
 * @param input - Search configuration
 * @returns Array of matching issues
 */
export function searchIssues(
  input: SearchIssuesInput
): SearchIssuesResult {
  const {
    results,
    query,
    fields = ['all'],
    caseSensitive = false,
  } = input

  if (!query || query.trim().length === 0) {
    return {
      matches: [],
      query,
      totalMatches: 0,
      fields,
    }
  }

  // Normalize: accept result object, JSON string, or MCP wrapper
  const normalized = normalizeAuditResult(results)
  const auditResult = normalized ?? results
  const issuesToSearch = Array.isArray(auditResult?.prioritizedIssues)
    ? auditResult.prioritizedIssues
    : []
  const searchQuery = caseSensitive ? query : query.toLowerCase()
  const matches: PrioritizedIssue[] = []

  issuesToSearch.forEach((issue) => {
    let found = false

    // Search in specified fields (guard against undefined for .toLowerCase / .includes)
    if (fields.includes('all') || fields.includes('description')) {
      const raw = issue.description ?? ''
      const description = caseSensitive ? raw : raw.toLowerCase()
      if (description.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('element')) {
      const raw = issue.element ?? ''
      const element = caseSensitive ? raw : raw.toLowerCase()
      if (element.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('xpath')) {
      const raw = issue.xpath ?? ''
      const xpath = caseSensitive ? raw : raw.toLowerCase()
      if (xpath.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('selector')) {
      const selector = issue.xpath ?? ''
      const selectorLower = caseSensitive ? selector : selector.toLowerCase()
      if (selectorLower.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('ruleId')) {
      const raw = issue.ruleId ?? ''
      const ruleId = caseSensitive ? raw : raw.toLowerCase()
      if (ruleId.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('userImpact')) {
      const raw = issue.userImpact ?? ''
      const userImpact = caseSensitive ? raw : raw.toLowerCase()
      if (userImpact.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('fix')) {
      const raw = issue.fix?.explanation ?? ''
      const fixExplanation = caseSensitive ? raw : raw.toLowerCase()
      if (fixExplanation.includes(searchQuery)) {
        found = true
      }
    }

    if (found) {
      matches.push(issue)
    }
  })

  return {
    matches,
    query,
    totalMatches: matches.length,
    fields,
  }
}
