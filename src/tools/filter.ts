/**
 * Filtering and search tools for audit results
 * Implements: filter_issues, search_issues
 */

import type {
  AuditResult,
  PrioritizedIssue,
  FilterIssuesInput,
  FilterIssuesResult,
  SearchIssuesInput,
  SearchIssuesResult,
  ImpactLevel,
  WCAGLevel,
} from '../types/index.js'

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

  let filteredIssues = [...results.prioritizedIssues]

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
    if (mode === 'include') {
      filteredIssues = filteredIssues.filter((issue) =>
        filters.wcagLevels!.includes(issue.wcagLevel as WCAGLevel)
      )
    } else {
      filteredIssues = filteredIssues.filter(
        (issue) => !filters.wcagLevels!.includes(issue.wcagLevel as WCAGLevel)
      )
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
  const levelA = filteredIssues.filter((i) => i.wcagLevel === 'A').length
  const levelAA = filteredIssues.filter((i) => i.wcagLevel === 'AA').length
  const levelAAA = filteredIssues.filter((i) => i.wcagLevel === 'AAA').length

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
      case 'critical':
        score -= 5
        break
      case 'serious':
        score -= 3
        break
      case 'moderate':
        score -= 1
        break
      case 'minor':
        score -= 0.5
        break
    }
  })
  score = Math.max(0, Math.round(score))

  // Create filtered audit result
  const filteredResult: AuditResult = {
    ...results,
    summary: {
      totalIssues: filteredIssues.length,
      score,
      wcagCompliance,
      byCategory,
      byImpact,
    },
    prioritizedIssues: filteredIssues,
    // Update quick wins and blockers based on filtered issues
    quickWins: results.quickWins.filter((qw) =>
      filteredIssues.some((issue) => issue.ruleId === qw.ruleId)
    ),
    criticalBlockers: results.criticalBlockers.filter((cb) =>
      filteredIssues.some((issue) => issue.ruleId === cb.ruleId)
    ),
  }

  return {
    filtered: filteredResult,
    originalCount: results.summary.totalIssues,
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

  const searchQuery = caseSensitive ? query : query.toLowerCase()
  const matches: PrioritizedIssue[] = []

  results.prioritizedIssues.forEach((issue) => {
    let found = false

    // Search in specified fields
    if (fields.includes('all') || fields.includes('description')) {
      const description = caseSensitive
        ? issue.description
        : issue.description.toLowerCase()
      if (description.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('element')) {
      const element = caseSensitive ? issue.element : issue.element.toLowerCase()
      if (element.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('xpath')) {
      const xpath = caseSensitive ? issue.xpath : issue.xpath.toLowerCase()
      if (xpath.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('selector')) {
      // Use xpath as selector since selector field doesn't exist in PrioritizedIssue
      const selector = issue.xpath || ''
      const selectorLower = caseSensitive ? selector : selector.toLowerCase()
      if (selectorLower.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('ruleId')) {
      const ruleId = caseSensitive ? issue.ruleId : issue.ruleId.toLowerCase()
      if (ruleId.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('userImpact')) {
      const userImpact = caseSensitive
        ? issue.userImpact
        : issue.userImpact.toLowerCase()
      if (userImpact.includes(searchQuery)) {
        found = true
      }
    }

    if (fields.includes('all') || fields.includes('fix')) {
      const fixExplanation = caseSensitive
        ? issue.fix.explanation
        : issue.fix.explanation.toLowerCase()
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
