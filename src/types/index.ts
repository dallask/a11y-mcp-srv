/**
 * TypeScript type definitions
 * Shared types for the Accessibility MCP Server
 */

// ============================================================================
// Core Accessibility Result Types
// ============================================================================

/**
 * Accessibility rule data structure from the accessibility engine
 */
/**
 * Impact/severity level for an issue. Uses each engine's native levels (no mapping).
 *
 * axe-core: critical | serious | moderate | minor
 * ACE (IBM Equal Access): violation | potentialviolation | potentialrecommendation | recommendation | manual | pass
 */
export type ImpactLevel = string

export interface AccessibilityRuleData {
  count: number
  xpaths: string[]
  selectors?: (string | boolean)[]
  text?: any[]
  hidden?: boolean[]
  description?: string
  domInfo?: DOMInfo[]
  contrastdata?: any[]
  tags?: string[] // Accessibility tags (e.g., "wcag2a", "wcag2aa", "best-practice")
  /** Engine-reported impact (axe: critical/serious/moderate/minor; ACE: violation/potentialviolation/...) */
  impact?: ImpactLevel
}

/**
 * Default impact order for sorting and scoring (higher = worse).
 * axe: critical, serious, moderate, minor. ACE: violation, potentialviolation, potentialrecommendation, recommendation, manual, pass.
 */
export const IMPACT_ORDER: Record<string, number> = {
  // axe-core
  critical: 6,
  serious: 5,
  moderate: 4,
  minor: 3,
  // ACE (IBM Equal Access)
  violation: 6,
  potentialviolation: 5,
  potentialrecommendation: 4,
  recommendation: 3,
  manual: 4,
  pass: 1,
  ignored: 0,
}

/**
 * DOM information for an element
 */
export interface DOMInfo {
  tagName?: string
  id?: string | null
  className?: string | null
  textContent?: string | null
  innerHTML?: string | null
  attributes?: Record<string, string>
  selector?: string
  error?: string
}

/**
 * Accessibility category structure (error, contrast, etc.)
 */
export interface AccessibilityCategory {
  count: number
  items: Record<string, AccessibilityRuleData>
}

/**
 * Accessibility report structure containing categories
 */
export interface AccessibilityReport {
  error?: AccessibilityCategory
  contrast?: AccessibilityCategory
  [key: string]: AccessibilityCategory | undefined
}

/**
 * Test engine metadata
 */
export interface TestEngine {
  name: string
  version: string
}

/**
 * Test runner metadata
 */
export interface TestRunner {
  name: string
}

/**
 * Test environment information
 */
export interface TestEnvironment {
  userAgent: string
  windowWidth: number
  windowHeight: number
  orientationType?: string
  orientationAngle?: number
}

/**
 * Complete accessibility results structure
 */
export interface AccessibilityResults {
  url: string
  timestamp: string
  testEngine: TestEngine
  testRunner: TestRunner
  testEnvironment: TestEnvironment
  violations: AccessibilityReport
}

/**
 * Test metadata structure
 */
export interface TestMetadata {
  testEngine: TestEngine
  testRunner: TestRunner
  testEnvironment: TestEnvironment
  timestamp: string
  url: string
}

// ============================================================================
// Audit Result Types
// ============================================================================

/**
 * WCAG compliance levels
 */
export type WCAGLevel = 'A' | 'AA' | 'AAA'

/**
 * WCAG compliance status
 */
export type ComplianceStatus = 'pass' | 'fail' | 'partial'

/**
 * Fix suggestion with code examples
 */
export interface FixSuggestion {
  current: string
  suggested: string
  explanation: string
}

/**
 * Prioritized accessibility issue
 */
export interface PrioritizedIssue {
  ruleId: string
  impact: ImpactLevel
  description: string
  wcagLevel: string
  tags: string[] // Array of tags this violation matches (e.g., ["wcag2a", "wcag2aa"])
  element: string
  xpath: string
  /** CSS class selector for the element (e.g. ".isi-btn.jsIsiMinimize") */
  classSelector?: string
  fix: FixSuggestion
  userImpact: string
  priority: number
  category?: string
  helpUrl?: string
}

/**
 * Quick win - easy fix with high impact
 */
export interface QuickWin {
  ruleId: string
  description: string
  impact: ImpactLevel
  fix: FixSuggestion
  estimatedTime: string // e.g., "5 minutes"
  affectedElements: number
}

/**
 * Critical blocker - must fix before launch
 */
export interface CriticalBlocker {
  ruleId: string
  description: string
  impact: ImpactLevel
  userImpact: string
  affectedElements: number
  wcagLevel: string
}

/**
 * WCAG compliance breakdown
 */
export interface WCAGCompliance {
  A: number // Percentage compliance for Level A
  AA: number // Percentage compliance for Level AA
  AAA: number // Percentage compliance for Level AAA
}

/**
 * Summary statistics for audit results
 */
export interface AuditSummary {
  totalIssues: number
  score: number // 0-100 accessibility score
  wcagCompliance: WCAGCompliance
  byCategory: Record<string, number> // Issues grouped by category
  byImpact: Record<string, number> // Issues grouped by impact level
}

/**
 * Applied filters information
 */
export interface AppliedFilters {
  tags?: string[] // Tags that were used to filter results
  originalIssueCount?: number // Total issues before filtering
}

/**
 * Complete audit result structure
 */
export interface AuditResult {
  summary: AuditSummary
  prioritizedIssues: PrioritizedIssue[]
  appliedFilters?: AppliedFilters
  conversationalSummary: string // Natural language summary
  issuesTable: string // Markdown table of all issues
  quickWins: QuickWin[]
  criticalBlockers: CriticalBlocker[]
  metadata?: TestMetadata
  rawResults?: AccessibilityResults // Optional: preserve original accessibility results
  /** HTTP status of the audited page (e.g. 200, 401). Set when Basic Auth or response is checked. */
  responseStatus?: number
}

// ============================================================================
// Session Management Types
// ============================================================================

/**
 * Login selectors for custom login forms
 */
export interface LoginSelectors {
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
  successIndicator?: string // Selector that appears after successful login
}

/**
 * Session configuration
 */
export interface SessionConfig {
  domain: string
  loginUrl?: string
  username: string
  password: string
  loginSelectors?: LoginSelectors
  sessionId?: string // Custom session identifier
}

/**
 * Active session information
 */
export interface Session {
  sessionId: string
  domain: string
  createdAt: string // ISO timestamp
  expiresAt: string // ISO timestamp
  testUrl?: string // URL to verify session is still valid
  isActive: boolean
}

/**
 * Session creation result
 */
export interface SessionResult {
  sessionId: string
  expiresAt: string
  testUrl: string
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

/**
 * Wait strategy for page loading
 */
export type WaitStrategy = 'networkidle' | 'load' | 'domcontentloaded'

/**
 * Audit strategy for site-wide audits
 */
export type AuditStrategy = 'critical' | 'comprehensive' | 'custom'

/**
 * Accessibility engine: axe-core (Deque) or IBM Equal Access (ACE)
 */
export type AccessibilityEngine = 'axe' | 'ace'

/**
 * Single URL audit input
 */
export interface AuditUrlInput {
  url: string // Full URL or relative path
  domain?: string // Base domain if URL is relative
  tags?: string[] // Specific accessibility tags to check (e.g., ["wcag2a", "wcag2aa"])
  waitForLoad?: WaitStrategy
  timeout?: number // Timeout in seconds
  engine?: AccessibilityEngine // 'axe' (default) or 'ace'
  /** HTTP Basic Auth username. Use with basicAuthPassword for sites that require Basic Authentication. */
  basicAuthUsername?: string
  /** HTTP Basic Auth password. Use with basicAuthUsername for sites that require Basic Authentication. */
  basicAuthPassword?: string
}

/**
 * Multiple URLs audit input
 */
export interface AuditMultipleUrlsInput {
  urls: string[] | string // Array of URLs or comma-separated string
  domain?: string
  parallel?: number // Number of parallel tests
  continueOnError?: boolean
  tags?: string[] // Applied to all URLs
  engine?: AccessibilityEngine // 'axe' (default) or 'ace'
  /** HTTP Basic Auth username for all URLs. Use with basicAuthPassword when sites require Basic Authentication. */
  basicAuthUsername?: string
  /** HTTP Basic Auth password. Use with basicAuthUsername. */
  basicAuthPassword?: string
}

/**
 * Site audit input
 */
export interface AuditSiteInput {
  domain: string
  tags?: string[] // Applied to all pages
  strategy?: AuditStrategy
  maxPages?: number
  priorityPaths?: string[]
}

/**
 * Authenticated audit input
 */
export interface AuditWithSessionInput {
  sessionId: string
  url: string
  domain?: string
  tags?: string[]
}

/**
 * Score calculation input
 */
export interface ScoreInput {
  results: AuditResult | string // Audit results or URL to score
  weights?: Record<string, number> // Custom weights for different issue types
}

/**
 * Score result
 */
export interface ScoreResult {
  overallScore: number // 0-100
  breakdown: Record<string, number> // Breakdown by category
  wcagCompliance: WCAGCompliance
  trend?: TrendData // If historical data available
}

/**
 * Prioritization criteria
 */
export type PrioritizationCriteria = 'impact' | 'wcag' | 'fixability' | 'user-impact'

/**
 * Prioritize issues input
 */
export interface PrioritizeIssuesInput {
  results: AuditResult
  criteria?: PrioritizationCriteria
  limit?: number // Top N issues to return
}

/**
 * Prioritize issues result
 */
export interface PrioritizeIssuesResult {
  prioritized: PrioritizedIssue[]
  quickWins: QuickWin[]
  criticalBlockers: CriticalBlocker[]
  reasoning: string // Explanation of prioritization
}

/**
 * Explain issue input
 */
export interface ExplainIssueInput {
  ruleId: string
  context?: string // Additional context about the issue
}

/**
 * Issue explanation result
 */
export interface IssueExplanation {
  ruleId: string
  explanation: string // Plain language explanation
  userImpact: string // Why it matters
  howToFix: string // How to fix with code examples
  wcagReference: string // WCAG criterion reference
  commonMistakes: string[] // Common mistakes to avoid
  codeExample?: {
    before: string
    after: string
  }
}

/**
 * Quick fixes input
 */
export interface QuickFixesInput {
  results: AuditResult | string
  format?: 'markdown' | 'html' | 'json'
  includeCode?: boolean
}

/**
 * Quick fix item
 */
export interface QuickFixItem {
  ruleId: string
  description: string
  currentCode?: string
  fixedCode?: string
  explanation: string
  impactEstimate: string
  affectedElements: number
}

/**
 * Quick fixes result
 */
export interface QuickFixesResult {
  fixes: QuickFixItem[]
  format: 'markdown' | 'html' | 'json'
  totalFixes: number
  formatted?: string // Formatted output for markdown/html formats
}

/**
 * Comparison input
 */
export interface CompareAccessibilityInput {
  before: AuditResult | string // Previous audit results or URL
  after: AuditResult | string // Current audit results or URL
  format?: 'summary' | 'detailed' | 'diff'
}

/**
 * Comparison result
 */
export interface ComparisonResult {
  issuesFixed: PrioritizedIssue[]
  issuesIntroduced: PrioritizedIssue[]
  scoreImprovement: number // Score difference (positive = improvement)
  remainingIssues: PrioritizedIssue[]
  summary: string
  format: 'summary' | 'detailed' | 'diff'
}

/**
 * Tracking timeframe
 */
export type TrackingTimeframe = '7d' | '30d' | '90d' | 'all'

/**
 * Tracking metric
 */
export type TrackingMetric = 'score' | 'issues' | 'wcag-compliance'

/**
 * Track accessibility input
 */
export interface TrackAccessibilityInput {
  url: string
  timeframe?: TrackingTimeframe
  metric?: TrackingMetric
}

/**
 * Trend data point
 */
export interface TrendDataPoint {
  timestamp: string
  value: number
  metadata?: Record<string, any>
}

/**
 * Trend data
 */
export interface TrendData {
  dataPoints: TrendDataPoint[]
  trend: 'improving' | 'declining' | 'stable'
  prediction?: {
    nextValue: number
    confidence: number
  }
  recommendations: string[]
  visualization?: string // Text-based trend visualization
}

/**
 * Track accessibility result
 */
export interface TrackAccessibilityResult {
  url: string
  historicalData: TrendData
  currentValue: number
  trend: TrendData['trend']
  predictions?: TrendData['prediction']
  recommendations: string[]
  visualization?: string // Text-based trend visualization
}

/**
 * Compliance report format
 */
export type ComplianceReportFormat = 'VPAT' | 'WCAG' | 'ADA' | 'Section508'

/**
 * Generate compliance report input
 */
export interface GenerateComplianceReportInput {
  results: AuditResult
  format?: ComplianceReportFormat
  level?: WCAGLevel
  includeRemediation?: boolean
}

/**
 * Compliance report result
 */
export interface ComplianceReport {
  format: ComplianceReportFormat
  level: WCAGLevel
  executiveSummary: string
  wcagMapping: Record<string, ComplianceStatus>
  remediationPlan?: QuickFixItem[]
  compliancePercentage: number
  reportContent: string // Formatted report content
}

/**
 * WCAG compliance input
 */
export interface WCAGComplianceInput {
  results: AuditResult | string
  level?: WCAGLevel
}

/**
 * WCAG criterion breakdown
 */
export interface WCAGCriterion {
  criterion: string // e.g., "1.1.1"
  title: string
  level: WCAGLevel
  status: ComplianceStatus
  violations: PrioritizedIssue[]
}

/**
 * WCAG compliance result
 */
export interface WCAGComplianceResult {
  level: WCAGLevel
  status: ComplianceStatus
  compliancePercentage: number
  criteria: WCAGCriterion[]
  missingRequirements: string[]
  summary: string
}

// ============================================================================
// Progress & Streaming Types
// ============================================================================

/**
 * Progress update for long-running operations
 */
export interface ProgressUpdate {
  current: number
  total: number
  percentage: number
  status: string
  estimatedTimeRemaining?: number // seconds
  currentItem?: string
}

/**
 * Batch audit progress
 */
export interface BatchAuditProgress extends ProgressUpdate {
  completedUrls: string[]
  failedUrls: string[]
  currentUrl?: string
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error result structure
 */
export interface AuditError {
  url: string
  error: string
  timestamp: string
  stack?: string
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Supported accessibility tags
 */
export type AccessibilityTag =
  | 'wcag2a'
  | 'wcag2aa'
  | 'wcag2aaa'
  | 'wcag21a'
  | 'wcag21aa'
  | 'wcag21aaa'
  | 'wcag22a'
  | 'wcag22aa'
  | 'wcag22aaa'
  | 'best-practice'

/**
 * Tag filter configuration
 */
export interface TagFilter {
  tags: AccessibilityTag[]
  mode?: 'include' | 'exclude' // Whether to include or exclude these tags
}

// ============================================================================
// Export Tool Types
// ============================================================================

/**
 * Export to CSV input
 */
export interface ExportToCsvInput {
  results: AuditResult | string // Audit result object or URL string
  includeMetadata?: boolean // Include test information and environment data (default: true)
  includeViolations?: boolean // Include detailed violation rows (default: true)
  format?: 'standard' | 'detailed' | 'minimal' // Export format (default: "standard")
}

/**
 * Export to CSV result
 */
export interface ExportToCsvResult {
  csv: string // CSV content as string
  format: 'standard' | 'detailed' | 'minimal'
  totalIssues: number
  includeMetadata: boolean
  includeViolations: boolean
}

/**
 * Export to Excel input
 */
export interface ExportToExcelInput {
  results: AuditResult | string // Audit result object or URL string
  includeCharts?: boolean // Generate charts for score trends and category breakdown (default: false)
  formatting?: boolean // Apply colors, headers, and styling (default: true)
}

/**
 * Export to Excel result
 */
export interface ExportToExcelResult {
  excel: string // Excel file content (base64 encoded)
  format: 'xlsx'
  totalIssues: number
  includeCharts: boolean
  formatting: boolean
}

/**
 * Export to JSON input
 */
export interface ExportToJsonInput {
  results: AuditResult | string // Audit result object or URL string
  pretty?: boolean // Pretty-print JSON (default: true)
  includeRaw?: boolean // Include raw accessibility engine results (default: false)
}

/**
 * Export to JSON result
 */
export interface ExportToJsonResult {
  json: string // JSON string
  pretty: boolean
  includeRaw: boolean
  totalIssues: number
}

/**
 * Export to HTML input
 */
export interface ExportToHtmlInput {
  results: AuditResult | string // Audit result object or URL string
  template?: 'default' | 'minimal' | 'detailed' // Report template (default: "default")
  includeCharts?: boolean // Include visual charts (default: true)
}

/**
 * Export to HTML result
 */
export interface ExportToHtmlResult {
  html: string // HTML string with embedded CSS/JS
  template: 'default' | 'minimal' | 'detailed'
  includeCharts: boolean
  totalIssues: number
}

// ============================================================================
// Filter Tool Types
// ============================================================================

/**
 * Filter criteria for filtering issues
 */
export interface FilterCriteria {
  ruleIds?: string[] // Array of rule IDs to include/exclude
  categories?: string[] // Array of categories (error, contrast, etc.)
  impactLevels?: ImpactLevel[] // Array of impact levels (critical, serious, etc.)
  wcagLevels?: WCAGLevel[] // Array of WCAG levels (A, AA, AAA)
  minCount?: number // Minimum occurrence count
  elementTypes?: string[] // Filter by HTML element types (e.g., ["img", "input", "button"])
}

/**
 * Filter issues input
 */
export interface FilterIssuesInput {
  results: AuditResult // Audit result object
  filters: FilterCriteria // Filter criteria
  mode?: 'include' | 'exclude' // Filter mode (default: "include")
}

/**
 * Filter issues result
 */
export interface FilterIssuesResult {
  filtered: AuditResult // Filtered audit result object
  originalCount: number // Total issues before filtering
  filteredCount: number // Total issues after filtering
  filtersApplied: FilterCriteria // Filters that were applied
  mode: 'include' | 'exclude'
}

/**
 * Search issues input
 */
export interface SearchIssuesInput {
  results: AuditResult // Audit result object
  query: string // Search query string
  fields?: ('description' | 'element' | 'xpath' | 'selector' | 'ruleId' | 'userImpact' | 'fix' | 'all')[] // Fields to search (default: ["all"])
  caseSensitive?: boolean // Case-sensitive search (default: false)
}

/**
 * Search issues result
 */
export interface SearchIssuesResult {
  matches: PrioritizedIssue[] // Array of matching issues
  query: string // Search query used
  totalMatches: number // Total number of matches
  fields: ('description' | 'element' | 'xpath' | 'selector' | 'ruleId' | 'userImpact' | 'fix' | 'all')[] // Fields that were searched
}

// ============================================================================
// Aggregate Tool Types
// ============================================================================

/**
 * Aggregate audit results input
 */
export interface AggregateAuditResultsInput {
  results: AuditResult[] // Array of audit result objects
  groupBy?: 'url' | 'category' | 'rule' | 'none' // Grouping strategy (default: "url")
  includeSummary?: boolean // Include aggregated summary statistics (default: true)
}

/**
 * Aggregated audit result with grouped issues
 */
export interface AggregateAuditResultsResult {
  aggregated: AuditResult // Aggregated audit result with combined statistics
  groupedBy: 'url' | 'category' | 'rule' | 'none' // Grouping strategy used
  totalResults: number // Number of results aggregated
  groupedIssues?: Record<string, PrioritizedIssue[]> // Issues grouped by the grouping strategy
  summary: AuditSummary // Aggregated summary statistics
}

/**
 * Breakdown dimension for statistics
 */
export type BreakdownDimension = 'category' | 'impact' | 'wcag' | 'rule'

/**
 * Get statistics input
 */
export interface GetStatisticsInput {
  results: AuditResult | AuditResult[] // Audit result object or array of results
  breakdown?: BreakdownDimension[] // Array of breakdown dimensions (default: all)
}

/**
 * Statistics breakdown by dimension
 */
export interface StatisticsBreakdown {
  counts: Record<string, number> // Counts by dimension value
  percentages: Record<string, number> // Percentages by dimension value
  distribution: Record<string, number> // Distribution (normalized to 0-1)
}

/**
 * Statistics result
 */
export interface GetStatisticsResult {
  totalIssues: number // Total number of issues
  averageScore: number // Average accessibility score
  totalResults: number // Number of audit results analyzed
  byCategory?: StatisticsBreakdown // Breakdown by category
  byImpact?: StatisticsBreakdown // Breakdown by impact level
  byWCAG?: StatisticsBreakdown // Breakdown by WCAG level
  byRule?: StatisticsBreakdown // Breakdown by rule ID
  wcagCompliance: WCAGCompliance // Average WCAG compliance
  breakdownDimensions: BreakdownDimension[] // Dimensions included in breakdown
}

// ============================================================================
// Visualization Tool Types
// ============================================================================

/**
 * Dashboard format
 */
export type DashboardFormat = 'text' | 'markdown' | 'html' | 'json'

/**
 * Generate dashboard input
 */
export interface GenerateDashboardInput {
  results: AuditResult | AuditResult[] | string | string[] // Audit result object(s) or URL string(s)
  format?: DashboardFormat // Output format (default: "markdown")
  includeCharts?: boolean // Include ASCII/text charts (default: true)
}

/**
 * Generate dashboard result
 */
export interface GenerateDashboardResult {
  dashboard: string // Formatted dashboard content
  format: DashboardFormat // Format used
  includeCharts: boolean // Whether charts were included
  totalResults: number // Number of audit results included
}

/**
 * Summary report format
 */
export type SummaryReportFormat = 'text' | 'markdown' | 'html'

/**
 * Summary report level
 */
export type SummaryReportLevel = 'executive' | 'detailed' | 'technical'

/**
 * Generate summary report input
 */
export interface GenerateSummaryReportInput {
  results: AuditResult | AuditResult[] | string | string[] // Audit result object(s) or URL string(s)
  format?: SummaryReportFormat // Output format (default: "markdown")
  level?: SummaryReportLevel // Detail level (default: "executive")
}

/**
 * Generate summary report result
 */
export interface GenerateSummaryReportResult {
  report: string // Formatted summary report content
  format: SummaryReportFormat // Format used
  level: SummaryReportLevel // Detail level used
  totalResults: number // Number of audit results included
}
