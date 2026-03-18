/**
 * Normalize audit result input so tools that accept "result or URL" can safely
 * handle JSON strings, MCP response wrappers, and partial objects.
 */

import type { AuditResult, AuditSummary, WCAGCompliance } from '../types/index.js'

const DEFAULT_SUMMARY: AuditSummary = {
  totalIssues: 0,
  score: 0,
  wcagCompliance: { A: 0, AA: 0, AAA: 0 },
  byCategory: {},
  byImpact: {},
}

function isUrlString(value: string): boolean {
  const t = value.trim()
  return t.startsWith('http://') || t.startsWith('https://')
}

function isJsonLikeString(value: string): boolean {
  return value.trim().startsWith('{')
}

/**
 * Normalize a raw object into a full AuditResult with guaranteed arrays and summary.
 */
function normalizeObject(obj: Record<string, unknown>): AuditResult {
  const prioritizedIssues = Array.isArray(obj.prioritizedIssues) ? obj.prioritizedIssues : []
  const quickWins = Array.isArray(obj.quickWins) ? obj.quickWins : []
  const criticalBlockers = Array.isArray(obj.criticalBlockers) ? obj.criticalBlockers : []

  let summary: AuditSummary = DEFAULT_SUMMARY
  if (obj.summary != null && typeof obj.summary === 'object') {
    const s = obj.summary as Record<string, unknown>
    const wcag = s.wcagCompliance != null && typeof s.wcagCompliance === 'object'
      ? (s.wcagCompliance as WCAGCompliance)
      : { A: 0, AA: 0, AAA: 0 }
    summary = {
      totalIssues: typeof s.totalIssues === 'number' ? s.totalIssues : 0,
      score: typeof s.score === 'number' ? s.score : 0,
      wcagCompliance: wcag,
      byCategory: s.byCategory != null && typeof s.byCategory === 'object' && !Array.isArray(s.byCategory)
        ? (s.byCategory as Record<string, number>)
        : {},
      byImpact: s.byImpact != null && typeof s.byImpact === 'object' && !Array.isArray(s.byImpact)
        ? (s.byImpact as Record<string, number>)
        : {},
    }
  }

  return {
    summary,
    prioritizedIssues,
    quickWins,
    criticalBlockers,
    conversationalSummary: typeof obj.conversationalSummary === 'string' ? obj.conversationalSummary : '',
    issuesTable: typeof obj.issuesTable === 'string' ? obj.issuesTable : '',
    appliedFilters: obj.appliedFilters != null && typeof obj.appliedFilters === 'object' ? obj.appliedFilters as AuditResult['appliedFilters'] : undefined,
    metadata: obj.metadata != null && typeof obj.metadata === 'object' ? obj.metadata as AuditResult['metadata'] : undefined,
    rawResults: obj.rawResults as AuditResult['rawResults'],
    responseStatus: typeof obj.responseStatus === 'number' ? obj.responseStatus : undefined,
  }
}

/**
 * Normalize audit result input from a client.
 * - URL string: returns null (caller should run audit).
 * - JSON string of single result: parses and normalizes.
 * - MCP wrapper { content: [{ text: "..." }] }: extracts and normalizes.
 * - Batch { results: [...] }: normalizes first element.
 * - Plain object: fills missing fields with defaults.
 *
 * @param value - Raw value (string, or object from previous tool output).
 * @returns Normalized AuditResult, or null when value is a URL (run audit) or parsing fails.
 */
export function normalizeAuditResult(value: unknown): AuditResult | null {
  if (value == null) {
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (isUrlString(trimmed)) {
      return null
    }
    if (isJsonLikeString(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        return normalizeAuditResult(parsed)
      } catch {
        return null
      }
    }
    return null
  }

  if (typeof value !== 'object') {
    return null
  }

  const obj = value as Record<string, unknown>

  // MCP response wrapper: { content: [ { type, text } ] }
  const content = obj.content
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0]
    if (first != null && typeof first === 'object' && 'text' in first && typeof (first as { text: unknown }).text === 'string') {
      try {
        const parsed = JSON.parse((first as { text: string }).text) as unknown
        return normalizeAuditResult(parsed)
      } catch {
        return null
      }
    }
  }

  // Batch result from audit_multiple_urls: { results: AuditResult[], ... }
  const resultsArray = obj.results
  if (Array.isArray(resultsArray) && resultsArray.length > 0) {
    return normalizeAuditResult(resultsArray[0])
  }

  // Plain audit result (single): must look like one (has summary or prioritizedIssues)
  if ('summary' in obj || 'prioritizedIssues' in obj) {
    return normalizeObject(obj)
  }

  // Empty or unrecognized object: return minimal valid result so callers don't throw
  return normalizeObject(obj)
}
