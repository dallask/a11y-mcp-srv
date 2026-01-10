/**
 * Visualization & dashboard tools
 * Implements: generate_dashboard, generate_summary_report
 */

import { auditUrl } from './audit.js'
import type {
  AuditResult,
  GenerateDashboardInput,
  GenerateDashboardResult,
  GenerateSummaryReportInput,
  GenerateSummaryReportResult,
} from '../types/index.js'

/**
 * Generate ASCII bar chart
 */
function generateBarChart(
  data: Record<string, number>,
  maxWidth: number = 50
): string {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const maxValue = Math.max(...entries.map(([, value]) => value), 1)

  const lines: string[] = []
  entries.forEach(([label, value]) => {
    const barLength = Math.round((value / maxValue) * maxWidth)
    const bar = '█'.repeat(barLength)
    const padding = ' '.repeat(Math.max(0, maxWidth - barLength))
    lines.push(`${label.padEnd(15)} │${bar}${padding} ${value}`)
  })

  return lines.join('\n')
}

/**
 * Generate score gauge visualization
 */
function generateScoreGauge(score: number): string {
  const filled = Math.round(score / 2) // Each block represents 2 points
  const empty = 50 - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  
  let status: string
  let emoji: string
  if (score >= 90) {
    status = 'Excellent'
    emoji = '🟢'
  } else if (score >= 75) {
    status = 'Good'
    emoji = '🟡'
  } else if (score >= 60) {
    status = 'Needs Improvement'
    emoji = '🟠'
  } else {
    status = 'Critical'
    emoji = '🔴'
  }

  return `${emoji} ${score}/100 ${status}\n${bar}`
}

/**
 * Format dashboard as markdown
 */
function formatDashboardAsMarkdown(
  results: AuditResult | AuditResult[],
  includeCharts: boolean
): string {
  const resultsArray = Array.isArray(results) ? results : [results]
  const isMultiple = resultsArray.length > 1

  const parts: string[] = []

  // Title
  if (isMultiple) {
    parts.push('# Accessibility Dashboard')
    parts.push(`\n**Summary of ${resultsArray.length} audit(s)**\n`)
  } else {
    const url = resultsArray[0].metadata?.url || 'Unknown URL'
    parts.push(`# Accessibility Dashboard`)
    parts.push(`\n**URL:** ${url}\n`)
  }

  // Overall metrics
  if (isMultiple) {
    const totalIssues = resultsArray.reduce(
      (sum, r) => sum + r.summary.totalIssues,
      0
    )
    const avgScore =
      resultsArray.reduce((sum, r) => sum + r.summary.score, 0) /
      resultsArray.length
    const avgWCAG = {
      A:
        resultsArray.reduce((sum, r) => sum + r.summary.wcagCompliance.A, 0) /
        resultsArray.length,
      AA:
        resultsArray.reduce((sum, r) => sum + r.summary.wcagCompliance.AA, 0) /
        resultsArray.length,
      AAA:
        resultsArray.reduce(
          (sum, r) => sum + r.summary.wcagCompliance.AAA,
          0
        ) / resultsArray.length,
    }

    parts.push('## Overall Metrics\n')
    parts.push(`- **Total Issues:** ${totalIssues}`)
    parts.push(`- **Average Score:** ${Math.round(avgScore)}/100`)
    parts.push(
      `- **WCAG Compliance:** A: ${Math.round(avgWCAG.A)}%, AA: ${Math.round(avgWCAG.AA)}%, AAA: ${Math.round(avgWCAG.AAA)}%`
    )

    if (includeCharts) {
      parts.push('\n### Score Distribution\n')
      parts.push('```')
      parts.push(generateScoreGauge(Math.round(avgScore)))
      parts.push('```')
    }
  } else {
    const result = resultsArray[0]
    parts.push('## Overall Metrics\n')
    parts.push(`- **Total Issues:** ${result.summary.totalIssues}`)
    parts.push(`- **Accessibility Score:** ${result.summary.score}/100`)
    parts.push(
      `- **WCAG Compliance:** A: ${result.summary.wcagCompliance.A}%, AA: ${result.summary.wcagCompliance.AA}%, AAA: ${result.summary.wcagCompliance.AAA}%`
    )

    if (includeCharts) {
      parts.push('\n### Score Gauge\n')
      parts.push('```')
      parts.push(generateScoreGauge(result.summary.score))
      parts.push('```')
    }
  }

  // Impact breakdown
  if (isMultiple) {
    const impactCounts: Record<string, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    }
    resultsArray.forEach((result) => {
      Object.entries(result.summary.byImpact).forEach(([impact, count]) => {
        impactCounts[impact] = (impactCounts[impact] || 0) + count
      })
    })

    parts.push('\n## Issues by Impact Level\n')
    if (includeCharts) {
      parts.push('```')
      parts.push(generateBarChart(impactCounts))
      parts.push('```')
    } else {
      Object.entries(impactCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          parts.push(`- **${impact}:** ${count}`)
        })
    }
  } else {
    const result = resultsArray[0]
    parts.push('\n## Issues by Impact Level\n')
    if (includeCharts) {
      parts.push('```')
      parts.push(generateBarChart(result.summary.byImpact))
      parts.push('```')
    } else {
      Object.entries(result.summary.byImpact)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          parts.push(`- **${impact}:** ${count}`)
        })
    }
  }

  // Category breakdown
  if (isMultiple) {
    const categoryCounts: Record<string, number> = {}
    resultsArray.forEach((result) => {
      Object.entries(result.summary.byCategory).forEach(([cat, count]) => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + count
      })
    })

    parts.push('\n## Issues by Category\n')
    if (includeCharts) {
      parts.push('```')
      parts.push(generateBarChart(categoryCounts))
      parts.push('```')
    } else {
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`- **${category}:** ${count}`)
        })
    }
  } else {
    const result = resultsArray[0]
    parts.push('\n## Issues by Category\n')
    if (includeCharts) {
      parts.push('```')
      parts.push(generateBarChart(result.summary.byCategory))
      parts.push('```')
    } else {
      Object.entries(result.summary.byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`- **${category}:** ${count}`)
        })
    }
  }

  // Critical blockers and quick wins
  if (!isMultiple) {
    const result = resultsArray[0]
    if (result.criticalBlockers.length > 0) {
      parts.push('\n## 🚨 Critical Blockers\n')
      parts.push(
        `Found ${result.criticalBlockers.length} critical blocker(s) that must be fixed before launch.\n`
      )
      result.criticalBlockers.slice(0, 5).forEach((blocker, index) => {
        parts.push(
          `${index + 1}. **${blocker.description}** (${blocker.affectedElements} element(s))`
        )
      })
    }

    if (result.quickWins.length > 0) {
      parts.push('\n## ✨ Quick Wins\n')
      parts.push(
        `Found ${result.quickWins.length} quick win(s) - easy fixes with high impact.\n`
      )
      result.quickWins.slice(0, 5).forEach((win, index) => {
        parts.push(
          `${index + 1}. **${win.description}** (${win.affectedElements} element(s), ${win.estimatedTime})`
        )
      })
    }
  }

  // Per-URL breakdown for multiple results
  if (isMultiple) {
    parts.push('\n## Per-URL Breakdown\n')
    parts.push('| URL | Issues | Score | WCAG A | WCAG AA | WCAG AAA |')
    parts.push('|-----|--------|-------|--------|---------|----------|')
    resultsArray.forEach((result) => {
      const url = result.metadata?.url || 'Unknown'
      const shortUrl = url.length > 50 ? url.substring(0, 47) + '...' : url
      parts.push(
        `| ${shortUrl} | ${result.summary.totalIssues} | ${result.summary.score}/100 | ${result.summary.wcagCompliance.A}% | ${result.summary.wcagCompliance.AA}% | ${result.summary.wcagCompliance.AAA}% |`
      )
    })
  }

  return parts.join('\n')
}

/**
 * Format dashboard as text
 */
function formatDashboardAsText(
  results: AuditResult | AuditResult[],
  includeCharts: boolean
): string {
  const resultsArray = Array.isArray(results) ? results : [results]
  const isMultiple = resultsArray.length > 1

  const parts: string[] = []

  // Title
  if (isMultiple) {
    parts.push('ACCESSIBILITY DASHBOARD')
    parts.push(`Summary of ${resultsArray.length} audit(s)\n`)
  } else {
    const url = resultsArray[0].metadata?.url || 'Unknown URL'
    parts.push('ACCESSIBILITY DASHBOARD')
    parts.push(`URL: ${url}\n`)
  }

  // Overall metrics
  if (isMultiple) {
    const totalIssues = resultsArray.reduce(
      (sum, r) => sum + r.summary.totalIssues,
      0
    )
    const avgScore =
      resultsArray.reduce((sum, r) => sum + r.summary.score, 0) /
      resultsArray.length
    const avgWCAG = {
      A:
        resultsArray.reduce((sum, r) => sum + r.summary.wcagCompliance.A, 0) /
        resultsArray.length,
      AA:
        resultsArray.reduce((sum, r) => sum + r.summary.wcagCompliance.AA, 0) /
        resultsArray.length,
      AAA:
        resultsArray.reduce(
          (sum, r) => sum + r.summary.wcagCompliance.AAA,
          0
        ) / resultsArray.length,
    }

    parts.push('OVERALL METRICS')
    parts.push(`Total Issues: ${totalIssues}`)
    parts.push(`Average Score: ${Math.round(avgScore)}/100`)
    parts.push(
      `WCAG Compliance: A: ${Math.round(avgWCAG.A)}%, AA: ${Math.round(avgWCAG.AA)}%, AAA: ${Math.round(avgWCAG.AAA)}%`
    )

    if (includeCharts) {
      parts.push('\nSCORE DISTRIBUTION')
      parts.push(generateScoreGauge(Math.round(avgScore)))
    }
  } else {
    const result = resultsArray[0]
    parts.push('OVERALL METRICS')
    parts.push(`Total Issues: ${result.summary.totalIssues}`)
    parts.push(`Accessibility Score: ${result.summary.score}/100`)
    parts.push(
      `WCAG Compliance: A: ${result.summary.wcagCompliance.A}%, AA: ${result.summary.wcagCompliance.AA}%, AAA: ${result.summary.wcagCompliance.AAA}%`
    )

    if (includeCharts) {
      parts.push('\nSCORE GAUGE')
      parts.push(generateScoreGauge(result.summary.score))
    }
  }

  // Impact breakdown
  if (isMultiple) {
    const impactCounts: Record<string, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    }
    resultsArray.forEach((result) => {
      Object.entries(result.summary.byImpact).forEach(([impact, count]) => {
        impactCounts[impact] = (impactCounts[impact] || 0) + count
      })
    })

    parts.push('\nISSUES BY IMPACT LEVEL')
    if (includeCharts) {
      parts.push(generateBarChart(impactCounts))
    } else {
      Object.entries(impactCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          parts.push(`${impact}: ${count}`)
        })
    }
  } else {
    const result = resultsArray[0]
    parts.push('\nISSUES BY IMPACT LEVEL')
    if (includeCharts) {
      parts.push(generateBarChart(result.summary.byImpact))
    } else {
      Object.entries(result.summary.byImpact)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          parts.push(`${impact}: ${count}`)
        })
    }
  }

  // Category breakdown
  if (isMultiple) {
    const categoryCounts: Record<string, number> = {}
    resultsArray.forEach((result) => {
      Object.entries(result.summary.byCategory).forEach(([cat, count]) => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + count
      })
    })

    parts.push('\nISSUES BY CATEGORY')
    if (includeCharts) {
      parts.push(generateBarChart(categoryCounts))
    } else {
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`${category}: ${count}`)
        })
    }
  } else {
    const result = resultsArray[0]
    parts.push('\nISSUES BY CATEGORY')
    if (includeCharts) {
      parts.push(generateBarChart(result.summary.byCategory))
    } else {
      Object.entries(result.summary.byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`${category}: ${count}`)
        })
    }
  }

  return parts.join('\n')
}

/**
 * Format dashboard as HTML
 */
function formatDashboardAsHTML(
  results: AuditResult | AuditResult[],
  includeCharts: boolean
): string {
  const resultsArray = Array.isArray(results) ? results : [results]
  const isMultiple = resultsArray.length > 1

  const parts: string[] = []

  parts.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .dashboard {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .metric-card {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #4CAF50;
    }
    .metric-value { font-size: 2em; font-weight: bold; color: #333; }
    .metric-label { color: #666; font-size: 0.9em; }
    .chart { background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 10px 0; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #4CAF50; color: white; }
    tr:hover { background: #f5f5f5; }
    .critical { color: #d32f2f; font-weight: bold; }
    .serious { color: #f57c00; }
    .moderate { color: #fbc02d; }
    .minor { color: #388e3c; }
  </style>
</head>
<body>
  <div class="dashboard">`)

  // Title
  if (isMultiple) {
    parts.push(`<h1>Accessibility Dashboard</h1>`)
    parts.push(`<p><strong>Summary of ${resultsArray.length} audit(s)</strong></p>`)
  } else {
    const url = resultsArray[0].metadata?.url || 'Unknown URL'
    parts.push(`<h1>Accessibility Dashboard</h1>`)
    parts.push(`<p><strong>URL:</strong> ${escapeHtml(url)}</p>`)
  }

  // Overall metrics
  if (isMultiple) {
    const totalIssues = resultsArray.reduce(
      (sum, r) => sum + r.summary.totalIssues,
      0
    )
    const avgScore =
      resultsArray.reduce((sum, r) => sum + r.summary.score, 0) /
      resultsArray.length
    const avgWCAG = {
      A:
        resultsArray.reduce((sum, r) => sum + r.summary.wcagCompliance.A, 0) /
        resultsArray.length,
      AA:
        resultsArray.reduce((sum, r) => sum + r.summary.wcagCompliance.AA, 0) /
        resultsArray.length,
      AAA:
        resultsArray.reduce(
          (sum, r) => sum + r.summary.wcagCompliance.AAA,
          0
        ) / resultsArray.length,
    }

    parts.push(`<h2>Overall Metrics</h2>`)
    parts.push(`<div class="metrics">`)
    parts.push(`<div class="metric-card"><div class="metric-value">${totalIssues}</div><div class="metric-label">Total Issues</div></div>`)
    parts.push(`<div class="metric-card"><div class="metric-value">${Math.round(avgScore)}</div><div class="metric-label">Average Score</div></div>`)
    parts.push(`<div class="metric-card"><div class="metric-value">${Math.round(avgWCAG.A)}%</div><div class="metric-label">WCAG A</div></div>`)
    parts.push(`<div class="metric-card"><div class="metric-value">${Math.round(avgWCAG.AA)}%</div><div class="metric-label">WCAG AA</div></div>`)
    parts.push(`</div>`)

    if (includeCharts) {
      parts.push(`<div class="chart"><pre>${generateScoreGauge(Math.round(avgScore))}</pre></div>`)
    }
  } else {
    const result = resultsArray[0]
    parts.push(`<h2>Overall Metrics</h2>`)
    parts.push(`<div class="metrics">`)
    parts.push(`<div class="metric-card"><div class="metric-value">${result.summary.totalIssues}</div><div class="metric-label">Total Issues</div></div>`)
    parts.push(`<div class="metric-card"><div class="metric-value">${result.summary.score}</div><div class="metric-label">Accessibility Score</div></div>`)
    parts.push(`<div class="metric-card"><div class="metric-value">${result.summary.wcagCompliance.A}%</div><div class="metric-label">WCAG A</div></div>`)
    parts.push(`<div class="metric-card"><div class="metric-value">${result.summary.wcagCompliance.AA}%</div><div class="metric-label">WCAG AA</div></div>`)
    parts.push(`</div>`)

    if (includeCharts) {
      parts.push(`<div class="chart"><pre>${generateScoreGauge(result.summary.score)}</pre></div>`)
    }
  }

  // Impact breakdown
  if (isMultiple) {
    const impactCounts: Record<string, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    }
    resultsArray.forEach((result) => {
      Object.entries(result.summary.byImpact).forEach(([impact, count]) => {
        impactCounts[impact] = (impactCounts[impact] || 0) + count
      })
    })

    parts.push(`<h2>Issues by Impact Level</h2>`)
    if (includeCharts) {
      parts.push(`<div class="chart"><pre>${generateBarChart(impactCounts)}</pre></div>`)
    } else {
      parts.push(`<ul>`)
      Object.entries(impactCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          parts.push(`<li class="${impact}"><strong>${impact}:</strong> ${count}</li>`)
        })
      parts.push(`</ul>`)
    }
  } else {
    const result = resultsArray[0]
    parts.push(`<h2>Issues by Impact Level</h2>`)
    if (includeCharts) {
      parts.push(`<div class="chart"><pre>${generateBarChart(result.summary.byImpact)}</pre></div>`)
    } else {
      parts.push(`<ul>`)
      Object.entries(result.summary.byImpact)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          parts.push(`<li class="${impact}"><strong>${impact}:</strong> ${count}</li>`)
        })
      parts.push(`</ul>`)
    }
  }

  // Category breakdown
  if (isMultiple) {
    const categoryCounts: Record<string, number> = {}
    resultsArray.forEach((result) => {
      Object.entries(result.summary.byCategory).forEach(([cat, count]) => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + count
      })
    })

    parts.push(`<h2>Issues by Category</h2>`)
    if (includeCharts) {
      parts.push(`<div class="chart"><pre>${generateBarChart(categoryCounts)}</pre></div>`)
    } else {
      parts.push(`<ul>`)
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`<li><strong>${category}:</strong> ${count}</li>`)
        })
      parts.push(`</ul>`)
    }
  } else {
    const result = resultsArray[0]
    parts.push(`<h2>Issues by Category</h2>`)
    if (includeCharts) {
      parts.push(`<div class="chart"><pre>${generateBarChart(result.summary.byCategory)}</pre></div>`)
    } else {
      parts.push(`<ul>`)
      Object.entries(result.summary.byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`<li><strong>${category}:</strong> ${count}</li>`)
        })
      parts.push(`</ul>`)
    }
  }

  // Per-URL breakdown for multiple results
  if (isMultiple) {
    parts.push(`<h2>Per-URL Breakdown</h2>`)
    parts.push(`<table>`)
    parts.push(`<tr><th>URL</th><th>Issues</th><th>Score</th><th>WCAG A</th><th>WCAG AA</th><th>WCAG AAA</th></tr>`)
    resultsArray.forEach((result) => {
      const url = result.metadata?.url || 'Unknown'
      parts.push(
        `<tr><td>${escapeHtml(url)}</td><td>${result.summary.totalIssues}</td><td>${result.summary.score}/100</td><td>${result.summary.wcagCompliance.A}%</td><td>${result.summary.wcagCompliance.AA}%</td><td>${result.summary.wcagCompliance.AAA}%</td></tr>`
      )
    })
    parts.push(`</table>`)
  }

  parts.push(`  </div>
</body>
</html>`)

  return parts.join('\n')
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * generate_dashboard - Create visual dashboard summary of audit results
 *
 * Generates a visual dashboard with key metrics, charts, and summaries
 * in various formats (text, markdown, HTML, JSON).
 *
 * @param input - Dashboard input (results or URL/array, format, includeCharts)
 * @returns Formatted dashboard with key metrics, charts, and summaries
 */
export async function generateDashboard(
  input: GenerateDashboardInput
): Promise<GenerateDashboardResult> {
  const {
    results,
    format = 'markdown',
    includeCharts = true,
  } = input

  let auditResults: AuditResult | AuditResult[]

  // If input is a URL string, run an audit first
  if (typeof results === 'string') {
    const singleResult = await auditUrl({ url: results })
    auditResults = singleResult
  } else if (Array.isArray(results)) {
    // If array contains URLs, audit them
    const urlResults = await Promise.all(
      results.map(async (r) => {
        if (typeof r === 'string') {
          return await auditUrl({ url: r })
        }
        return r
      })
    )
    auditResults = urlResults
  } else {
    auditResults = results
  }

  // Format dashboard based on requested format
  let dashboard: string
  switch (format) {
    case 'text':
      dashboard = formatDashboardAsText(auditResults, includeCharts)
      break
    case 'html':
      dashboard = formatDashboardAsHTML(auditResults, includeCharts)
      break
    case 'json':
      const resultsArray = Array.isArray(auditResults)
        ? auditResults
        : [auditResults]
      dashboard = JSON.stringify(
        {
          summary: resultsArray.map((r) => ({
            url: r.metadata?.url || 'Unknown',
            totalIssues: r.summary.totalIssues,
            score: r.summary.score,
            wcagCompliance: r.summary.wcagCompliance,
            byImpact: r.summary.byImpact,
            byCategory: r.summary.byCategory,
            criticalBlockers: r.criticalBlockers.length,
            quickWins: r.quickWins.length,
          })),
        },
        null,
        2
      )
      break
    case 'markdown':
    default:
      dashboard = formatDashboardAsMarkdown(auditResults, includeCharts)
      break
  }

  return {
    dashboard,
    format,
    includeCharts,
    totalResults: Array.isArray(auditResults) ? auditResults.length : 1,
  }
}

/**
 * Generate executive summary report
 */
function generateExecutiveSummary(
  results: AuditResult | AuditResult[],
  level: 'executive' | 'detailed' | 'technical'
): string {
  const resultsArray = Array.isArray(results) ? results : [results]
  const isMultiple = resultsArray.length > 1

  const parts: string[] = []

  if (level === 'executive') {
    // High-level summary for executives
    if (isMultiple) {
      const totalIssues = resultsArray.reduce(
        (sum, r) => sum + r.summary.totalIssues,
        0
      )
      const avgScore =
        resultsArray.reduce((sum, r) => sum + r.summary.score, 0) /
        resultsArray.length

      parts.push('## Executive Summary')
      parts.push(
        `\nAn accessibility audit was conducted on ${resultsArray.length} page(s), identifying ${totalIssues} accessibility issue(s).`
      )
      parts.push(`\n**Key Findings:**`)
      parts.push(`- Average Accessibility Score: ${Math.round(avgScore)}/100`)
      parts.push(`- Total Issues Found: ${totalIssues}`)

      const criticalCount = resultsArray.reduce(
        (sum, r) => sum + (r.summary.byImpact.critical || 0),
        0
      )
      if (criticalCount > 0) {
        parts.push(
          `- Critical Issues: ${criticalCount} (must be addressed before launch)`
        )
      }

      const quickWinsCount = resultsArray.reduce(
        (sum, r) => sum + r.quickWins.length,
        0
      )
      if (quickWinsCount > 0) {
        parts.push(
          `- Quick Wins Available: ${quickWinsCount} (easy fixes with high impact)`
        )
      }

      parts.push(
        `\n**Recommendation:** ${avgScore >= 80 ? 'The site demonstrates good accessibility practices. Continue monitoring and address remaining issues.' : avgScore >= 60 ? 'The site needs improvement to meet accessibility standards. Prioritize critical issues and quick wins.' : 'The site requires significant accessibility improvements before launch. Address critical blockers immediately.'}`
      )
    } else {
      const result = resultsArray[0]
      parts.push('## Executive Summary')
      parts.push(
        `\nAn accessibility audit was conducted, identifying ${result.summary.totalIssues} accessibility issue(s).`
      )
      parts.push(`\n**Key Findings:**`)
      parts.push(`- Accessibility Score: ${result.summary.score}/100`)
      parts.push(`- Total Issues Found: ${result.summary.totalIssues}`)

      if (result.criticalBlockers.length > 0) {
        parts.push(
          `- Critical Blockers: ${result.criticalBlockers.length} (must be fixed before launch)`
        )
      }

      if (result.quickWins.length > 0) {
        parts.push(
          `- Quick Wins Available: ${result.quickWins.length} (easy fixes with high impact)`
        )
      }

      parts.push(
        `\n**Recommendation:** ${result.summary.score >= 80 ? 'The page demonstrates good accessibility practices. Continue monitoring and address remaining issues.' : result.summary.score >= 60 ? 'The page needs improvement to meet accessibility standards. Prioritize critical issues and quick wins.' : 'The page requires significant accessibility improvements before launch. Address critical blockers immediately.'}`
      )
    }
  } else if (level === 'detailed') {
    // Detailed summary with more information
    if (isMultiple) {
      const totalIssues = resultsArray.reduce(
        (sum, r) => sum + r.summary.totalIssues,
        0
      )
      const avgScore =
        resultsArray.reduce((sum, r) => sum + r.summary.score, 0) /
        resultsArray.length
      const avgWCAG = {
        A:
          resultsArray.reduce(
            (sum, r) => sum + r.summary.wcagCompliance.A,
            0
          ) / resultsArray.length,
        AA:
          resultsArray.reduce(
            (sum, r) => sum + r.summary.wcagCompliance.AA,
            0
          ) / resultsArray.length,
        AAA:
          resultsArray.reduce(
            (sum, r) => sum + r.summary.wcagCompliance.AAA,
            0
          ) / resultsArray.length,
      }

      parts.push('## Detailed Summary')
      parts.push(
        `\nAn accessibility audit was conducted on ${resultsArray.length} page(s), identifying ${totalIssues} accessibility issue(s).`
      )
      parts.push(`\n**Overall Metrics:**`)
      parts.push(`- Average Accessibility Score: ${Math.round(avgScore)}/100`)
      parts.push(`- Total Issues: ${totalIssues}`)
      parts.push(
        `- WCAG Compliance: Level A: ${Math.round(avgWCAG.A)}%, Level AA: ${Math.round(avgWCAG.AA)}%, Level AAA: ${Math.round(avgWCAG.AAA)}%`
      )

      // Impact breakdown
      const impactCounts: Record<string, number> = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
      }
      resultsArray.forEach((result) => {
        Object.entries(result.summary.byImpact).forEach(([impact, count]) => {
          impactCounts[impact] = (impactCounts[impact] || 0) + count
        })
      })

      parts.push(`\n**Issues by Impact:**`)
      Object.entries(impactCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          if (count > 0) {
            parts.push(`- ${impact}: ${count}`)
          }
        })

      // Category breakdown
      const categoryCounts: Record<string, number> = {}
      resultsArray.forEach((result) => {
        Object.entries(result.summary.byCategory).forEach(([cat, count]) => {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + count
        })
      })

      parts.push(`\n**Issues by Category:**`)
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`- ${category}: ${count}`)
        })

      const criticalCount = resultsArray.reduce(
        (sum, r) => sum + (r.summary.byImpact.critical || 0),
        0
      )
      const quickWinsCount = resultsArray.reduce(
        (sum, r) => sum + r.quickWins.length,
        0
      )

      parts.push(`\n**Priority Actions:**`)
      if (criticalCount > 0) {
        parts.push(
          `- Address ${criticalCount} critical issue(s) that prevent users with disabilities from accessing content`
        )
      }
      if (quickWinsCount > 0) {
        parts.push(
          `- Implement ${quickWinsCount} quick win(s) for immediate accessibility improvements`
        )
      }

      parts.push(
        `\n**Next Steps:** ${avgScore >= 80 ? 'Continue monitoring accessibility and address remaining issues. Consider implementing automated accessibility testing in your CI/CD pipeline.' : avgScore >= 60 ? 'Prioritize critical issues and quick wins. Develop an accessibility remediation plan with clear timelines.' : 'Immediately address critical blockers. Conduct a comprehensive accessibility review and develop a detailed remediation plan.'}`
      )
    } else {
      const result = resultsArray[0]
      parts.push('## Detailed Summary')
      parts.push(
        `\nAn accessibility audit was conducted, identifying ${result.summary.totalIssues} accessibility issue(s).`
      )
      parts.push(`\n**Overall Metrics:**`)
      parts.push(`- Accessibility Score: ${result.summary.score}/100`)
      parts.push(`- Total Issues: ${result.summary.totalIssues}`)
      parts.push(
        `- WCAG Compliance: Level A: ${result.summary.wcagCompliance.A}%, Level AA: ${result.summary.wcagCompliance.AA}%, Level AAA: ${result.summary.wcagCompliance.AAA}%`
      )

      parts.push(`\n**Issues by Impact:**`)
      Object.entries(result.summary.byImpact)
        .sort((a, b) => b[1] - a[1])
        .forEach(([impact, count]) => {
          if (count > 0) {
            parts.push(`- ${impact}: ${count}`)
          }
        })

      parts.push(`\n**Issues by Category:**`)
      Object.entries(result.summary.byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          parts.push(`- ${category}: ${count}`)
        })

      if (result.criticalBlockers.length > 0) {
        parts.push(`\n**Critical Blockers:**`)
        result.criticalBlockers.slice(0, 5).forEach((blocker, index) => {
          parts.push(
            `${index + 1}. ${blocker.description} (${blocker.affectedElements} element(s))`
          )
        })
      }

      if (result.quickWins.length > 0) {
        parts.push(`\n**Quick Wins:**`)
        result.quickWins.slice(0, 5).forEach((win, index) => {
          parts.push(
            `${index + 1}. ${win.description} (${win.affectedElements} element(s), ${win.estimatedTime})`
          )
        })
      }

      parts.push(
        `\n**Next Steps:** ${result.summary.score >= 80 ? 'Continue monitoring accessibility and address remaining issues. Consider implementing automated accessibility testing.' : result.summary.score >= 60 ? 'Prioritize critical issues and quick wins. Develop an accessibility remediation plan.' : 'Immediately address critical blockers. Conduct a comprehensive accessibility review and develop a detailed remediation plan.'}`
      )
    }
  } else {
    // Technical summary with detailed information
    if (isMultiple) {
      const totalIssues = resultsArray.reduce(
        (sum, r) => sum + r.summary.totalIssues,
        0
      )
      const avgScore =
        resultsArray.reduce((sum, r) => sum + r.summary.score, 0) /
        resultsArray.length

      parts.push('## Technical Summary')
      parts.push(
        `\nAccessibility audit results for ${resultsArray.length} page(s):`
      )
      parts.push(`\n**Statistics:**`)
      parts.push(`- Total Issues: ${totalIssues}`)
      parts.push(`- Average Score: ${Math.round(avgScore)}/100`)

      // Per-URL breakdown
      parts.push(`\n**Per-URL Breakdown:**`)
      resultsArray.forEach((result, index) => {
        const url = result.metadata?.url || 'Unknown'
        parts.push(
          `\n${index + 1}. ${url}`
        )
        parts.push(`   - Issues: ${result.summary.totalIssues}`)
        parts.push(`   - Score: ${result.summary.score}/100`)
        parts.push(
          `   - WCAG: A: ${result.summary.wcagCompliance.A}%, AA: ${result.summary.wcagCompliance.AA}%, AAA: ${result.summary.wcagCompliance.AAA}%`
        )
        if (result.criticalBlockers.length > 0) {
          parts.push(`   - Critical Blockers: ${result.criticalBlockers.length}`)
        }
        if (result.quickWins.length > 0) {
          parts.push(`   - Quick Wins: ${result.quickWins.length}`)
        }
      })
    } else {
      const result = resultsArray[0]
      const url = result.metadata?.url || 'Unknown'
      parts.push('## Technical Summary')
      parts.push(`\nAccessibility audit results for: ${url}`)
      parts.push(`\n**Statistics:**`)
      parts.push(`- Total Issues: ${result.summary.totalIssues}`)
      parts.push(`- Score: ${result.summary.score}/100`)
      parts.push(
        `- WCAG Compliance: A: ${result.summary.wcagCompliance.A}%, AA: ${result.summary.wcagCompliance.AA}%, AAA: ${result.summary.wcagCompliance.AAA}%`
      )

      parts.push(`\n**Impact Breakdown:**`)
      Object.entries(result.summary.byImpact).forEach(([impact, count]) => {
        parts.push(`- ${impact}: ${count}`)
      })

      parts.push(`\n**Category Breakdown:**`)
      Object.entries(result.summary.byCategory).forEach(([category, count]) => {
        parts.push(`- ${category}: ${count}`)
      })

      if (result.criticalBlockers.length > 0) {
        parts.push(`\n**Critical Blockers (${result.criticalBlockers.length}):**`)
        result.criticalBlockers.forEach((blocker) => {
          parts.push(`- ${blocker.ruleId}: ${blocker.description}`)
          parts.push(`  - Affected Elements: ${blocker.affectedElements}`)
          parts.push(`  - WCAG Level: ${blocker.wcagLevel}`)
        })
      }

      if (result.quickWins.length > 0) {
        parts.push(`\n**Quick Wins (${result.quickWins.length}):**`)
        result.quickWins.forEach((win) => {
          parts.push(`- ${win.ruleId}: ${win.description}`)
          parts.push(`  - Affected Elements: ${win.affectedElements}`)
          parts.push(`  - Estimated Time: ${win.estimatedTime}`)
        })
      }
    }
  }

  return parts.join('\n')
}

/**
 * Format summary report as markdown
 */
function formatSummaryReportAsMarkdown(
  results: AuditResult | AuditResult[],
  level: 'executive' | 'detailed' | 'technical'
): string {
  const parts: string[] = []

  parts.push('# Accessibility Summary Report')
  parts.push(`\n**Report Date:** ${new Date().toISOString().split('T')[0]}`)

  const summary = generateExecutiveSummary(results, level)
  parts.push(summary)

  return parts.join('\n')
}

/**
 * Format summary report as text
 */
function formatSummaryReportAsText(
  results: AuditResult | AuditResult[],
  level: 'executive' | 'detailed' | 'technical'
): string {
  const parts: string[] = []

  parts.push('ACCESSIBILITY SUMMARY REPORT')
  parts.push(`Report Date: ${new Date().toISOString().split('T')[0]}\n`)

  const summary = generateExecutiveSummary(results, level)
  // Convert markdown-style formatting to plain text
  const textSummary = summary
    .replace(/## /g, '\n')
    .replace(/\*\*/g, '')
    .replace(/# /g, '')
  parts.push(textSummary)

  return parts.join('\n')
}

/**
 * Format summary report as HTML
 */
function formatSummaryReportAsHTML(
  results: AuditResult | AuditResult[],
  level: 'executive' | 'detailed' | 'technical'
): string {
  const parts: string[] = []

  parts.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Summary Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .report {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    p { line-height: 1.6; color: #333; }
    ul { line-height: 1.8; }
    .date { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="report">`)

  parts.push(`<h1>Accessibility Summary Report</h1>`)
  parts.push(
    `<p class="date"><strong>Report Date:</strong> ${new Date().toISOString().split('T')[0]}</p>`
  )

  const summary = generateExecutiveSummary(results, level)
  // Convert markdown to HTML
  const htmlSummary = summary
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n- (.+)/g, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')

  parts.push(htmlSummary)

  parts.push(`  </div>
</body>
</html>`)

  return parts.join('\n')
}

/**
 * generate_summary_report - Generate executive summary report
 *
 * Generates an executive summary report with key findings and recommendations
 * in various formats (text, markdown, HTML) and detail levels.
 *
 * @param input - Summary report input (results or URL/array, format, level)
 * @returns Summary report with key findings and recommendations
 */
export async function generateSummaryReport(
  input: GenerateSummaryReportInput
): Promise<GenerateSummaryReportResult> {
  const {
    results,
    format = 'markdown',
    level = 'executive',
  } = input

  let auditResults: AuditResult | AuditResult[]

  // If input is a URL string, run an audit first
  if (typeof results === 'string') {
    const singleResult = await auditUrl({ url: results })
    auditResults = singleResult
  } else if (Array.isArray(results)) {
    // If array contains URLs, audit them
    const urlResults = await Promise.all(
      results.map(async (r) => {
        if (typeof r === 'string') {
          return await auditUrl({ url: r })
        }
        return r
      })
    )
    auditResults = urlResults
  } else {
    auditResults = results
  }

  // Format report based on requested format
  let report: string
  switch (format) {
    case 'text':
      report = formatSummaryReportAsText(auditResults, level)
      break
    case 'html':
      report = formatSummaryReportAsHTML(auditResults, level)
      break
    case 'markdown':
    default:
      report = formatSummaryReportAsMarkdown(auditResults, level)
      break
  }

  return {
    report,
    format,
    level,
    totalResults: Array.isArray(auditResults) ? auditResults.length : 1,
  }
}
