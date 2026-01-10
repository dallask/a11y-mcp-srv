/**
 * TypeScript type definitions
 * Shared types for the WAVE Accessibility MCP Server
 */

// ============================================================================
// Core WAVE Result Types
// ============================================================================

/**
 * WAVE rule data structure from the WAVE engine
 */
export interface WaveRuleData {
  count: number
  xpaths: string[]
  selectors?: (string | boolean)[]
  text?: any[]
  hidden?: boolean[]
  description?: string
  domInfo?: DOMInfo[]
  contrastdata?: any[]
  tags?: string[] // Accessibility tags (e.g., "wcag2a", "wcag2aa", "best-practice")
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
 * WAVE category structure (error, contrast, etc.)
 */
export interface WaveCategory {
  count: number
  items: Record<string, WaveRuleData>
}

/**
 * WAVE report structure containing categories
 */
export interface WaveReport {
  error?: WaveCategory
  contrast?: WaveCategory
  [key: string]: WaveCategory | undefined
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
 * Complete WAVE results structure
 */
export interface WaveResults {
  url: string
  timestamp: string
  testEngine: TestEngine
  testRunner: TestRunner
  testEnvironment: TestEnvironment
  violations: WaveReport
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
 * Impact level of an accessibility issue
 */
export type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor'

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
  wcagLevel: WCAGLevel
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
  quickWins: QuickWin[]
  criticalBlockers: CriticalBlocker[]
  metadata?: TestMetadata
  rawResults?: WaveResults // Optional: preserve original WAVE results
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
 * Single URL audit input
 */
export interface AuditUrlInput {
  url: string // Full URL or relative path
  domain?: string // Base domain if URL is relative
  tags?: string[] // Specific accessibility tags to check (e.g., ["wcag2a", "wcag2aa"])
  waitForLoad?: WaitStrategy
  timeout?: number // Timeout in seconds
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
  | 'best-practice'

/**
 * Tag filter configuration
 */
export interface TagFilter {
  tags: AccessibilityTag[]
  mode?: 'include' | 'exclude' // Whether to include or exclude these tags
}
