/**
 * Comparison tools
 * Implements: compare_accessibility, track_accessibility
 */

import { auditUrl } from './audit.js'
import type {
  AuditResult,
  CompareAccessibilityInput,
  ComparisonResult,
  PrioritizedIssue,
  TrackAccessibilityInput,
  TrackAccessibilityResult,
  TrendData,
  TrendDataPoint,
  TrackingTimeframe,
  TrackingMetric,
} from '../types/index.js'

/**
 * Create a unique identifier for an issue based on its key properties
 * This helps identify the same issue across different audits
 */
function createIssueKey(issue: PrioritizedIssue): string {
  // Use ruleId, xpath, and element to create a unique key
  // This helps identify the same issue even if other properties change
  return `${issue.ruleId}:${issue.xpath}:${issue.element}`
}

/**
 * Compare two sets of issues to find differences
 */
function compareIssues(
  beforeIssues: PrioritizedIssue[],
  afterIssues: PrioritizedIssue[]
): {
  fixed: PrioritizedIssue[]
  introduced: PrioritizedIssue[]
  remaining: PrioritizedIssue[]
} {
  const beforeMap = new Map<string, PrioritizedIssue>()
  const afterMap = new Map<string, PrioritizedIssue>()

  // Index issues by their unique key
  beforeIssues.forEach((issue) => {
    const key = createIssueKey(issue)
    beforeMap.set(key, issue)
  })

  afterIssues.forEach((issue) => {
    const key = createIssueKey(issue)
    afterMap.set(key, issue)
  })

  // Find fixed issues (in before but not in after)
  const fixed: PrioritizedIssue[] = []
  beforeMap.forEach((issue, key) => {
    if (!afterMap.has(key)) {
      fixed.push(issue)
    }
  })

  // Find introduced issues (in after but not in before)
  const introduced: PrioritizedIssue[] = []
  afterMap.forEach((issue, key) => {
    if (!beforeMap.has(key)) {
      introduced.push(issue)
    }
  })

  // Find remaining issues (in both before and after)
  const remaining: PrioritizedIssue[] = []
  afterMap.forEach((issue, key) => {
    if (beforeMap.has(key)) {
      remaining.push(issue)
    }
  })

  return { fixed, introduced, remaining }
}

/**
 * Generate a visual diff summary
 */
function generateDiffSummary(
  fixed: PrioritizedIssue[],
  introduced: PrioritizedIssue[],
  remaining: PrioritizedIssue[],
  scoreImprovement: number
): string {
  const parts: string[] = []

  parts.push('## Accessibility Comparison Summary\n')

  // Score improvement
  if (scoreImprovement > 0) {
    parts.push(`✅ **Score improved by ${scoreImprovement} points**\n`)
  } else if (scoreImprovement < 0) {
    parts.push(`⚠️ **Score decreased by ${Math.abs(scoreImprovement)} points**\n`)
  } else {
    parts.push(`➡️ **Score unchanged**\n`)
  }

  // Fixed issues
  if (fixed.length > 0) {
    parts.push(`\n### ✅ Fixed Issues (${fixed.length})`)
    parts.push(`\nGreat progress! ${fixed.length} issue(s) have been resolved:\n`)
    
    // Group by rule ID
    const ruleGroups = new Map<string, PrioritizedIssue[]>()
    fixed.forEach((issue) => {
      if (!ruleGroups.has(issue.ruleId)) {
        ruleGroups.set(issue.ruleId, [])
      }
      ruleGroups.get(issue.ruleId)!.push(issue)
    })

    ruleGroups.forEach((groupIssues) => {
      const firstIssue = groupIssues[0]
      parts.push(`- **${firstIssue.description}** (${groupIssues.length} instance${groupIssues.length !== 1 ? 's' : ''})`)
      parts.push(`  - Impact: ${firstIssue.impact}`)
      parts.push(`  - WCAG Level: ${firstIssue.wcagLevel}`)
    })
  } else {
    parts.push(`\n### ✅ Fixed Issues (0)`)
    parts.push(`\nNo issues were fixed in this comparison.\n`)
  }

  // Introduced issues
  if (introduced.length > 0) {
    parts.push(`\n### ⚠️ Introduced Issues (${introduced.length})`)
    parts.push(`\n⚠️ ${introduced.length} new issue(s) were introduced:\n`)
    
    const ruleGroups = new Map<string, PrioritizedIssue[]>()
    introduced.forEach((issue) => {
      if (!ruleGroups.has(issue.ruleId)) {
        ruleGroups.set(issue.ruleId, [])
      }
      ruleGroups.get(issue.ruleId)!.push(issue)
    })

    ruleGroups.forEach((groupIssues) => {
      const firstIssue = groupIssues[0]
      parts.push(`- **${firstIssue.description}** (${groupIssues.length} instance${groupIssues.length !== 1 ? 's' : ''})`)
      parts.push(`  - Impact: ${firstIssue.impact}`)
      parts.push(`  - WCAG Level: ${firstIssue.wcagLevel}`)
      parts.push(`  - Element: ${firstIssue.element}`)
    })
  } else {
    parts.push(`\n### ⚠️ Introduced Issues (0)`)
    parts.push(`\nNo new issues were introduced. Great job!\n`)
  }

  // Remaining issues
  if (remaining.length > 0) {
    parts.push(`\n### 🔄 Remaining Issues (${remaining.length})`)
    parts.push(`\n${remaining.length} issue(s) still need to be addressed:\n`)
    
    // Show top 10 remaining issues by priority
    const topRemaining = remaining
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10)

    topRemaining.forEach((issue) => {
      parts.push(`- **${issue.description}**`)
      parts.push(`  - Impact: ${issue.impact}`)
      parts.push(`  - WCAG Level: ${issue.wcagLevel}`)
      parts.push(`  - Element: ${issue.element}`)
    })

    if (remaining.length > 10) {
      parts.push(`\n... and ${remaining.length - 10} more issue(s)`)
    }
  } else {
    parts.push(`\n### 🔄 Remaining Issues (0)`)
    parts.push(`\n🎉 All issues have been resolved!\n`)
  }

  // Overall assessment
  parts.push(`\n### 📊 Overall Assessment`)
  if (fixed.length > introduced.length && scoreImprovement > 0) {
    parts.push(`\n✅ **Positive progress!** More issues were fixed than introduced, and the accessibility score improved.`)
  } else if (introduced.length > fixed.length) {
    parts.push(`\n⚠️ **Attention needed!** More issues were introduced than fixed. Consider reviewing recent changes.`)
  } else if (fixed.length > 0 && introduced.length === 0) {
    parts.push(`\n✅ **Excellent progress!** Issues were fixed without introducing new ones.`)
  } else if (fixed.length === 0 && introduced.length === 0 && remaining.length > 0) {
    parts.push(`\n➡️ **No changes.** The accessibility status remains the same.`)
  } else {
    parts.push(`\n📊 **Status update:** Review the details above for specific changes.`)
  }

  return parts.join('\n')
}

/**
 * compare_accessibility - Before/after comparison with diff visualization
 * 
 * Compares two accessibility audits to identify issues that were fixed,
 * introduced, or remain. Provides score improvement and visual diff summary.
 * 
 * @param input - Comparison input (before/after results or URLs, format)
 * @returns Comparison result with fixed, introduced, and remaining issues
 */
export async function compareAccessibility(
  input: CompareAccessibilityInput
): Promise<ComparisonResult> {
  const {
    before,
    after,
    format = 'summary',
  } = input

  // Get audit results - if strings, run audits first
  let beforeResult: AuditResult
  let afterResult: AuditResult

  if (typeof before === 'string') {
    beforeResult = await auditUrl({
      url: before,
      basicAuthUsername: input.basicAuthUsername,
      basicAuthPassword: input.basicAuthPassword,
    })
  } else {
    beforeResult = before
  }

  if (typeof after === 'string') {
    afterResult = await auditUrl({
      url: after,
      basicAuthUsername: input.basicAuthUsername,
      basicAuthPassword: input.basicAuthPassword,
    })
  } else {
    afterResult = after
  }

  // Compare issues
  const { fixed, introduced, remaining } = compareIssues(
    beforeResult.prioritizedIssues,
    afterResult.prioritizedIssues
  )

  // Calculate score improvement
  const scoreImprovement = afterResult.summary.score - beforeResult.summary.score

  // Generate summary based on format
  let summary: string
  if (format === 'diff' || format === 'detailed') {
    summary = generateDiffSummary(fixed, introduced, remaining, scoreImprovement)
  } else {
    // Summary format - concise version
    summary = `Score: ${beforeResult.summary.score} → ${afterResult.summary.score} (${scoreImprovement > 0 ? '+' : ''}${scoreImprovement}). `
    summary += `Fixed: ${fixed.length}, Introduced: ${introduced.length}, Remaining: ${remaining.length}`
  }

  return {
    issuesFixed: fixed,
    issuesIntroduced: introduced,
    scoreImprovement,
    remainingIssues: remaining,
    summary,
    format,
  }
}

// ============================================================================
// Historical Tracking Implementation
// ============================================================================

/**
 * In-memory storage for historical audit data
 * Key: URL, Value: Array of audit results with timestamps
 */
const historicalDataStore = new Map<string, Array<{ timestamp: string; result: AuditResult }>>()

/**
 * Calculate days from timeframe string
 */
function getDaysFromTimeframe(timeframe: TrackingTimeframe): number | null {
  switch (timeframe) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    case 'all':
      return null // All data
    default:
      return 30 // Default to 30 days
  }
}

/**
 * Filter historical data by timeframe
 */
function filterByTimeframe(
  data: Array<{ timestamp: string; result: AuditResult }>,
  timeframe: TrackingTimeframe
): Array<{ timestamp: string; result: AuditResult }> {
  const days = getDaysFromTimeframe(timeframe)
  if (days === null) {
    return data
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return data.filter((entry) => {
    const entryDate = new Date(entry.timestamp)
    return entryDate >= cutoffDate
  })
}

/**
 * Extract metric value from audit result
 */
function extractMetric(result: AuditResult, metric: TrackingMetric): number {
  switch (metric) {
    case 'score':
      return result.summary.score
    case 'issues':
      return result.summary.totalIssues
    case 'wcag-compliance':
      // Return average WCAG compliance
      return (
        result.summary.wcagCompliance.A +
        result.summary.wcagCompliance.AA +
        result.summary.wcagCompliance.AAA
      ) / 3
    default:
      return result.summary.score
  }
}

/**
 * Calculate trend from data points
 */
function calculateTrend(dataPoints: TrendDataPoint[]): 'improving' | 'declining' | 'stable' {
  if (dataPoints.length < 2) {
    return 'stable'
  }

  // Sort by timestamp (oldest first)
  const sorted = [...dataPoints].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  // Calculate trend based on first and last values
  const firstValue = sorted[0].value
  const lastValue = sorted[sorted.length - 1].value
  const difference = lastValue - firstValue
  const percentChange = (difference / firstValue) * 100

  // For score and wcag-compliance: higher is better
  // For issues: lower is better
  // We'll determine this based on the metric type in the calling function

  if (Math.abs(percentChange) < 2) {
    return 'stable'
  }

  // For score and wcag-compliance, positive change is improving
  // For issues, negative change is improving
  // Since we don't know the metric here, we'll use a general approach
  // The caller will adjust based on metric type
  return difference > 0 ? 'improving' : 'declining'
}

/**
 * Calculate trend with metric awareness
 */
function calculateTrendForMetric(
  dataPoints: TrendDataPoint[],
  metric: TrackingMetric
): 'improving' | 'declining' | 'stable' {
  const trend = calculateTrend(dataPoints)
  
  // For 'issues' metric, lower is better, so reverse the trend
  if (metric === 'issues') {
    if (trend === 'improving') return 'declining'
    if (trend === 'declining') return 'improving'
    return 'stable'
  }

  // For 'score' and 'wcag-compliance', higher is better
  return trend
}

/**
 * Generate predictions using simple linear regression
 */
function generatePrediction(
  dataPoints: TrendDataPoint[]
): { nextValue: number; confidence: number } | undefined {
  if (dataPoints.length < 3) {
    return undefined // Need at least 3 points for prediction
  }

  // Sort by timestamp (oldest first)
  const sorted = [...dataPoints].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  // Simple linear regression
  const n = sorted.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  sorted.forEach((point, index) => {
    const x = index
    const y = point.value
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  })

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Predict next value (one step ahead)
  const nextValue = slope * n + intercept

  // Calculate confidence based on data variance
  const meanY = sumY / n
  let variance = 0
  sorted.forEach((point) => {
    variance += Math.pow(point.value - meanY, 2)
  })
  variance /= n
  const stdDev = Math.sqrt(variance)

  // Confidence decreases with higher variance
  // Max confidence is 0.9 (90%), min is 0.3 (30%)
  const confidence = Math.max(0.3, Math.min(0.9, 1 - (stdDev / (meanY || 1))))

  return {
    nextValue: Math.round(nextValue * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  }
}

/**
 * Generate recommendations based on trend and data
 */
function generateRecommendations(
  trend: 'improving' | 'declining' | 'stable',
  metric: TrackingMetric,
  currentValue: number,
  dataPoints: TrendDataPoint[]
): string[] {
  const recommendations: string[] = []

  if (trend === 'declining') {
    if (metric === 'score') {
      recommendations.push('Accessibility score is declining. Review recent changes and prioritize fixing critical issues.')
      recommendations.push('Focus on quick wins - issues that are easy to fix but have high impact.')
    } else if (metric === 'issues') {
      recommendations.push('Number of accessibility issues is increasing. Audit recent code changes for accessibility regressions.')
      recommendations.push('Consider implementing automated accessibility testing in your CI/CD pipeline.')
    } else {
      recommendations.push('WCAG compliance is declining. Review and fix violations, starting with Level A requirements.')
    }
  } else if (trend === 'improving') {
    if (metric === 'score') {
      recommendations.push('Great progress! Continue monitoring and addressing remaining issues.')
      recommendations.push('Consider setting up regular accessibility audits to maintain improvements.')
    } else if (metric === 'issues') {
      recommendations.push('Excellent! Issues are decreasing. Keep up the good work!')
      recommendations.push('Focus on preventing new issues by training the team on accessibility best practices.')
    } else {
      recommendations.push('WCAG compliance is improving. Continue working toward higher compliance levels.')
    }
  } else {
    recommendations.push('Accessibility status is stable. Consider proactive improvements to reach higher standards.')
    recommendations.push('Review remaining issues and prioritize fixes based on impact and user needs.')
  }

  // Add metric-specific recommendations
  if (metric === 'score' && currentValue < 70) {
    recommendations.push('Score is below 70. Prioritize critical and serious issues to improve accessibility significantly.')
  }

  if (metric === 'issues' && currentValue > 20) {
    recommendations.push('High number of issues detected. Consider a systematic approach: fix critical issues first, then work through by category.')
  }

  if (dataPoints.length < 3) {
    recommendations.push('More historical data will improve trend analysis and predictions. Run regular audits to build a baseline.')
  }

  return recommendations
}

/**
 * Generate text-based trend visualization
 */
function generateTrendVisualization(
  dataPoints: TrendDataPoint[],
  metric: TrackingMetric
): string {
  if (dataPoints.length === 0) {
    return 'No data available for visualization.'
  }

  // Sort by timestamp
  const sorted = [...dataPoints].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  // Find min and max values for scaling
  const values = sorted.map((p) => p.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1

  // Create simple ASCII chart
  const lines: string[] = []
  lines.push(`\nTrend Visualization (${metric}):`)
  lines.push('')

  // Use 20 characters width for the chart
  const chartWidth = 20
  sorted.forEach((point) => {
    const date = new Date(point.timestamp)
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const normalizedValue = (point.value - minValue) / range
    const barLength = Math.round(normalizedValue * chartWidth)
    const bar = '█'.repeat(barLength) + '░'.repeat(chartWidth - barLength)
    lines.push(`${dateStr.padEnd(12)} │${bar} ${point.value.toFixed(1)}`)
  })

  return lines.join('\n')
}

/**
 * track_accessibility - Historical tracking with trend analysis
 * 
 * Tracks accessibility metrics over time, providing trend analysis,
 * predictions, and recommendations. Stores audit results in memory for
 * historical comparison.
 * 
 * @param input - Tracking input (URL, timeframe, metric)
 * @returns Tracking result with historical data, trends, and recommendations
 */
export async function trackAccessibility(
  input: TrackAccessibilityInput
): Promise<TrackAccessibilityResult> {
  const {
    url,
    timeframe = '30d',
    metric = 'score',
  } = input

  // Run current audit
  const currentResult = await auditUrl({
    url,
    basicAuthUsername: input.basicAuthUsername,
    basicAuthPassword: input.basicAuthPassword,
  })

  // Get current metric value
  const currentValue = extractMetric(currentResult, metric)

  // Store in historical data
  if (!historicalDataStore.has(url)) {
    historicalDataStore.set(url, [])
  }

  const historicalData = historicalDataStore.get(url)!
  
  // Add current result
  historicalData.push({
    timestamp: currentResult.metadata?.timestamp || new Date().toISOString(),
    result: currentResult,
  })

  // Filter by timeframe
  const filteredData = filterByTimeframe(historicalData, timeframe)

  // Extract metric values as trend data points
  const dataPoints: TrendDataPoint[] = filteredData.map((entry) => ({
    timestamp: entry.timestamp,
    value: extractMetric(entry.result, metric),
    metadata: {
      totalIssues: entry.result.summary.totalIssues,
      score: entry.result.summary.score,
    },
  }))

  // Calculate trend
  const trend = calculateTrendForMetric(dataPoints, metric)

  // Generate prediction
  const prediction = generatePrediction(dataPoints)

  // Generate recommendations
  const recommendations = generateRecommendations(
    trend,
    metric,
    currentValue,
    dataPoints
  )

  // Generate trend visualization
  const visualization = generateTrendVisualization(dataPoints, metric)

  // Create trend data
  const trendData: TrendData = {
    dataPoints,
    trend,
    prediction,
    recommendations,
    visualization,
  }

  return {
    url,
    historicalData: trendData,
    currentValue,
    trend,
    predictions: prediction,
    recommendations,
    visualization,
  }
}
