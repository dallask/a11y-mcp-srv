/**
 * Normalize audit result input so tools that accept "result or URL" receive the same
 * canonical AuditResult shape that audit_url returns. Handles JSON strings, MCP
 * response wrappers, batch results, and alternate metadata shapes (e.g. ACE vs axe).
 */

import type {
  AuditResult,
  AuditSummary,
  TestMetadata,
  WCAGCompliance,
} from '../types/index.js'

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
 * Build canonical TestMetadata from any raw object (top-level or metadata in various shapes).
 * Ensures all tools receive the same metadata shape regardless of engine (axe, ACE) or API.
 */
function buildCanonicalMetadata(obj: Record<string, unknown>): TestMetadata | undefined {
  const meta = obj.metadata != null && typeof obj.metadata === 'object' ? (obj.metadata as Record<string, unknown>) : {}
  const url =
    (typeof obj.url === 'string' ? obj.url : undefined) ??
    (typeof meta.url === 'string' ? meta.url : undefined)
  const timestamp =
    (typeof obj.timestamp === 'string' ? obj.timestamp : undefined) ??
    (typeof meta.timestamp === 'string' ? meta.timestamp : undefined) ??
    (typeof meta.testDate === 'string' ? meta.testDate : undefined)
  if (!url && !timestamp && meta.testEngine == null && meta.testRunner == null) {
    return undefined
  }
  const testEngine =
    meta.testEngine != null && typeof meta.testEngine === 'object' && !Array.isArray(meta.testEngine)
      ? {
          name: String((meta.testEngine as Record<string, unknown>).name ?? 'Unknown'),
          version: String((meta.testEngine as Record<string, unknown>).version ?? ''),
        }
      : { name: String(meta.testEngine ?? 'Unknown'), version: '' }
  const testRunner =
    meta.testRunner != null && typeof meta.testRunner === 'object' && !Array.isArray(meta.testRunner)
      ? { name: String((meta.testRunner as Record<string, unknown>).name ?? 'Unknown') }
      : { name: String(meta.testRunner ?? 'Unknown') }
  const env = meta.testEnvironment != null && typeof meta.testEnvironment === 'object' && !Array.isArray(meta.testEnvironment)
    ? (meta.testEnvironment as Record<string, unknown>)
    : {}
  const viewport = typeof meta.viewport === 'string' ? meta.viewport : ''
  const [w, h] = viewport ? viewport.split('x').map((n) => parseInt(n, 10)) : [env.windowWidth as number | undefined, env.windowHeight as number | undefined]
  const testEnvironment = {
    userAgent: String(env.userAgent ?? 'unknown'),
    windowWidth: typeof w === 'number' && !Number.isNaN(w) ? w : 1280,
    windowHeight: typeof h === 'number' && !Number.isNaN(h) ? h : 720,
    orientationType: env.orientationType as string | undefined,
    orientationAngle: env.orientationAngle as number | undefined,
  }
  return {
    testEngine,
    testRunner,
    testEnvironment,
    timestamp: timestamp ?? new Date().toISOString(),
    url: url ?? '',
  }
}

/**
 * Normalize a raw object into the canonical AuditResult shape (same as audit_url returns).
 * Metadata is always normalized to TestMetadata when present.
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

  const metadata = buildCanonicalMetadata(obj)

  return {
    summary,
    prioritizedIssues,
    quickWins,
    criticalBlockers,
    conversationalSummary: typeof obj.conversationalSummary === 'string' ? obj.conversationalSummary : '',
    issuesTable: typeof obj.issuesTable === 'string' ? obj.issuesTable : '',
    appliedFilters: obj.appliedFilters != null && typeof obj.appliedFilters === 'object' ? (obj.appliedFilters as AuditResult['appliedFilters']) : undefined,
    metadata: metadata ?? (obj.metadata != null && typeof obj.metadata === 'object' ? (obj.metadata as AuditResult['metadata']) : undefined),
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

  // Wrapped single result: { results: <audit object>, format?: string, ... } (e.g. full tool args passed as results)
  const singleResult = obj.results
  if (
    singleResult != null &&
    typeof singleResult === 'object' &&
    !Array.isArray(singleResult) &&
    (('summary' in singleResult && singleResult.summary != null) ||
      ('prioritizedIssues' in singleResult && Array.isArray(singleResult.prioritizedIssues)))
  ) {
    return normalizeAuditResult(singleResult)
  }

  // Plain audit result (single): must look like one (has summary or prioritizedIssues)
  if ('summary' in obj || 'prioritizedIssues' in obj) {
    return normalizeObject(obj)
  }

  // Empty or unrecognized object: return minimal valid result so callers don't throw
  return normalizeObject(obj)
}
