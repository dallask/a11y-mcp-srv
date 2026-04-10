/**
 * Export tools for audit results
 * Implements: export_to_csv, export_to_excel, export_to_json, export_to_html_report
 */

import { resolveAuditInput } from '../core/normalize-audit-result.js'
import { auditUrl } from './audit.js'
import type {
  AuditResult,
  ExportToCsvInput,
  ExportToCsvResult,
  ExportToExcelInput,
  ExportToExcelResult,
  ExportToJsonInput,
  ExportToJsonResult,
  ExportToHtmlInput,
  ExportToHtmlResult,
  ExportUrlAuditOptions,
} from '../types/index.js'

/**
 * Options forwarded to {@link auditUrl} when `results` is a URL (shared browser, ACE cache, default wait `load`).
 */
function pickUrlAuditOptions(o: ExportUrlAuditOptions): ExportUrlAuditOptions {
  const { domain, tags, waitForLoad, timeout, engine, includeRawResults } = o
  return { domain, tags, waitForLoad, timeout, engine, includeRawResults }
}

/**
 * Resolve `results` to an {@link AuditResult}, running {@link auditUrl} when `results` is a URL.
 */
async function auditResultFromExportInput(
  results: AuditResult | string,
  basicAuthUsername: string | undefined,
  basicAuthPassword: string | undefined,
  urlAudit?: ExportUrlAuditOptions
): Promise<AuditResult> {
  const resolved = resolveAuditInput(results, basicAuthUsername, basicAuthPassword)
  if (resolved.kind === 'url') {
    const opts = urlAudit ? pickUrlAuditOptions(urlAudit) : {}
    return auditUrl({
      url: resolved.urlWithoutAuth,
      basicAuthUsername: resolved.basicAuthUsername,
      basicAuthPassword: resolved.basicAuthPassword,
      ...opts,
    })
  }
  return resolved.result
}

/**
 * Escape CSV field - handles quotes, commas, and newlines
 */
function escapeCSV(field: string | null | undefined): string {
  if (field === null || field === undefined) {
    return '""'
  }
  const stringField = String(field)
  // If the field contains quotes, commas, or newlines, wrap it in quotes and escape internal quotes
  if (
    stringField.includes('"') ||
    stringField.includes(',') ||
    stringField.includes('\n')
  ) {
    return `"${stringField.replace(/"/g, '""')}"`
  }
  return stringField
}

/**
 * Generate metadata section for CSV
 */
function generateMetadataSection(result: AuditResult): string {
  const metadata = result.metadata
  if (!metadata) {
    return ''
  }

  const te = metadata.testEnvironment
  const orientationInfo =
    te && te.orientationAngle !== undefined
      ? `${te.orientationType ?? ''} (${te.orientationAngle}°)`
      : te?.orientationType ?? 'N/A'

  const rows: string[] = [
    'Test Information',
    `Test URL,${escapeCSV(metadata.url ?? '')}`,
  ]
  if (metadata.testEngine) {
    rows.push(`Test Engine,${escapeCSV(`${metadata.testEngine.name} v${metadata.testEngine.version}`)}`)
    rows.push(`Test Runner,${escapeCSV(metadata.testRunner?.name ?? '')}`)
  }
  if (metadata.timestamp != null) {
    rows.push(`Timestamp,${escapeCSV(metadata.timestamp)}`)
  }
  if (te) {
    rows.push('', 'Environment Information')
    rows.push(`User Agent,${escapeCSV(te.userAgent ?? '')}`)
    rows.push(`Window Size,${escapeCSV(`${te.windowWidth ?? ''}x${te.windowHeight ?? ''}`)}`)
    rows.push(`Orientation,${escapeCSV(orientationInfo)}`)
  }
  rows.push(
    '',
    'Summary',
    `Total Issues,${result.summary.totalIssues}`,
    `Accessibility Score,${result.summary.score}`,
    `WCAG Level A Compliance,${result.summary.wcagCompliance.A}%`,
    `WCAG Level AA Compliance,${result.summary.wcagCompliance.AA}%`,
    `WCAG Level AAA Compliance,${result.summary.wcagCompliance.AAA}%`,
    '',
    'Test Results',
    ''
  )
  return rows.join('\n')
}

/**
 * export_to_csv - Export audit results to CSV format
 * 
 * Exports audit results to CSV format for spreadsheet analysis, including
 * metadata section and detailed violation rows.
 * 
 * @param input - Export configuration
 * @returns CSV content as string
 */
export async function exportToCsv(
  input: ExportToCsvInput
): Promise<ExportToCsvResult> {
  const {
    results,
    includeMetadata = true,
    includeViolations = true,
    format = 'standard',
    basicAuthUsername,
    basicAuthPassword,
  } = input

  const auditResult = await auditResultFromExportInput(
    results,
    basicAuthUsername,
    basicAuthPassword,
    input
  )

  const issues = Array.isArray(auditResult?.prioritizedIssues) ? auditResult.prioritizedIssues : []
  const csvRows: string[] = []

  // Add metadata section if requested
  if (includeMetadata) {
    csvRows.push(generateMetadataSection(auditResult))
  }

  // Add violation rows if requested
  if (includeViolations) {
    // Determine headers based on format
    let headers: string[]
    if (format === 'minimal') {
      headers = ['Rule ID', 'Impact', 'Description', 'Element']
    } else if (format === 'detailed') {
      headers = [
        'Rule ID',
        'Category',
        'Impact',
        'WCAG Level',
        'Description',
        'Element',
        'XPath',
        'Class selector',
        'User Impact',
        'Fix Explanation',
        'Current Code',
        'Suggested Code',
        'Priority',
      ]
    } else {
      // standard format
      headers = [
        'Rule ID',
        'Category',
        'Impact',
        'WCAG Level',
        'Description',
        'Element',
        'XPath',
        'Class selector',
        'User Impact',
        'Fix Explanation',
      ]
    }

    // Add header row
    csvRows.push(headers.map(escapeCSV).join(','))

    // Add violation rows
    issues.forEach((issue) => {
      const row: string[] = []

      if (format === 'minimal') {
        row.push(
          issue.ruleId,
          issue.impact,
          issue.description,
          issue.element
        )
      } else if (format === 'detailed') {
        row.push(
          issue.ruleId,
          issue.category || 'unknown',
          issue.impact,
          issue.wcagLevel,
          issue.description,
          issue.element,
          issue.xpath,
          issue.classSelector ?? '',
          issue.userImpact,
          issue.fix?.explanation ?? '',
          issue.fix?.current ?? '',
          issue.fix?.suggested ?? '',
          String(issue.priority)
        )
      } else {
        // standard format
        row.push(
          issue.ruleId,
          issue.category || 'unknown',
          issue.impact,
          issue.wcagLevel,
          issue.description,
          issue.element,
          issue.xpath,
          issue.classSelector ?? '',
          issue.userImpact,
          issue.fix?.explanation ?? ''
        )
      }

      csvRows.push(row.map(escapeCSV).join(','))
    })
  }

  const csvContent = csvRows.join('\n')

  return {
    csv: csvContent,
    format,
    totalIssues: auditResult.summary.totalIssues,
    includeMetadata,
    includeViolations,
  }
}

/**
 * export_to_excel - Export audit results to Excel/XLSX format
 * 
 * Exports audit results to Excel format with formatting. Requires xlsx package.
 * 
 * @param input - Export configuration
 * @returns Excel file content (base64 encoded)
 */
export async function exportToExcel(
  input: ExportToExcelInput
): Promise<ExportToExcelResult> {
  const {
    results,
    includeCharts = false,
    formatting = true,
    basicAuthUsername,
    basicAuthPassword,
  } = input

  const auditResult = await auditResultFromExportInput(
    results,
    basicAuthUsername,
    basicAuthPassword,
    input
  )

  const issues = Array.isArray(auditResult?.prioritizedIssues) ? auditResult.prioritizedIssues : []
  // Try to import xlsx, but handle gracefully if not available
  let XLSX: any
  try {
    XLSX = await import('xlsx')
  } catch (error) {
    throw new Error(
      'xlsx package is required for Excel export. Install it with: npm install xlsx'
    )
  }

  // Create workbook
  const workbook = XLSX.utils.book_new()

  // Create summary sheet
  const summaryData = [
    ['Accessibility Audit Summary'],
    [],
    ['Total Issues', auditResult.summary.totalIssues],
    ['Accessibility Score', auditResult.summary.score],
    ['WCAG Level A Compliance', `${auditResult.summary.wcagCompliance.A}%`],
    ['WCAG Level AA Compliance', `${auditResult.summary.wcagCompliance.AA}%`],
    ['WCAG Level AAA Compliance', `${auditResult.summary.wcagCompliance.AAA}%`],
    [],
    ['Issues by Category'],
  ]

  // Add category breakdown
  Object.entries(auditResult.summary.byCategory).forEach(([category, count]) => {
    summaryData.push([category, count])
  })

  summaryData.push([])
  summaryData.push(['Issues by Impact'])

  // Add impact breakdown
  Object.entries(auditResult.summary.byImpact).forEach(([impact, count]) => {
    summaryData.push([impact, count])
  })

  // Add metadata if available
  if (auditResult.metadata) {
    summaryData.push([])
    summaryData.push(['Test Information'])
    summaryData.push(['Test Engine', `${auditResult.metadata.testEngine.name} v${auditResult.metadata.testEngine.version}`])
    summaryData.push(['Test Runner', auditResult.metadata.testRunner.name])
    summaryData.push(['Test URL', auditResult.metadata.url])
    summaryData.push(['Timestamp', auditResult.metadata.timestamp])
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  if (formatting) {
    // Set column widths
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }]
  }
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  // Create violations sheet (WCAG Level = full label e.g. "WCAG 2.2 AA"; Element = tag name; Class selector after XPath)
  const violationsData = [
    [
      'Rule ID',
      'Category',
      'Impact',
      'WCAG Level',
      'Description',
      'Element',
      'XPath',
      'Class selector',
      'User Impact',
      'Fix Explanation',
    ],
  ]

  issues.forEach((issue) => {
    violationsData.push([
      issue.ruleId,
      issue.category || 'unknown',
      issue.impact,
      issue.wcagLevel,
      issue.description,
      issue.element,
      issue.xpath,
      issue.classSelector ?? '',
      issue.userImpact,
      issue.fix?.explanation ?? '',
    ])
  })

  const violationsSheet = XLSX.utils.aoa_to_sheet(violationsData)
  if (formatting) {
    // Set column widths
    violationsSheet['!cols'] = [
      { wch: 20 }, // Rule ID
      { wch: 15 }, // Category
      { wch: 12 }, // Impact
      { wch: 14 }, // WCAG Level
      { wch: 40 }, // Description
      { wch: 30 }, // Element
      { wch: 50 }, // XPath
      { wch: 28 }, // Class selector
      { wch: 50 }, // User Impact
      { wch: 50 }, // Fix Explanation
    ]
  }
  XLSX.utils.book_append_sheet(workbook, violationsSheet, 'Violations')

  // Generate Excel file as base64
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const base64Content = excelBuffer.toString('base64')

  return {
    excel: base64Content,
    format: 'xlsx',
    totalIssues: auditResult.summary.totalIssues,
    includeCharts,
    formatting,
  }
}

/**
 * export_to_json - Export audit results as structured JSON
 * 
 * Exports audit results as structured JSON with optional raw results.
 * 
 * @param input - Export configuration
 * @returns JSON string
 */
export async function exportToJson(
  input: ExportToJsonInput
): Promise<ExportToJsonResult> {
  const {
    results,
    pretty = true,
    includeRaw = false,
    basicAuthUsername,
    basicAuthPassword,
  } = input

  const auditResult = await auditResultFromExportInput(
    results,
    basicAuthUsername,
    basicAuthPassword,
    {
      ...pickUrlAuditOptions(input),
      includeRawResults:
        includeRaw === true || input.includeRawResults === true,
    }
  )

  // Prepare export data
  const exportData: any = {
    summary: auditResult.summary,
    prioritizedIssues: auditResult.prioritizedIssues,
    quickWins: auditResult.quickWins,
    criticalBlockers: auditResult.criticalBlockers,
    conversationalSummary: auditResult.conversationalSummary,
    metadata: auditResult.metadata,
  }

  // Include raw results if requested
  if (includeRaw && auditResult.rawResults) {
    exportData.rawResults = auditResult.rawResults
  }

  // Generate JSON
  const jsonContent = pretty
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData)

  return {
    json: jsonContent,
    pretty,
    includeRaw,
    totalIssues: auditResult.summary.totalIssues,
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return ''
  }
  const s = String(text)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate HTML report template
 */
function generateHtmlReport(
  result: AuditResult,
  template: 'default' | 'minimal' | 'detailed',
  includeCharts: boolean
): string {
  const metadata = result.metadata
  const summary = result.summary
  const issues = Array.isArray(result?.prioritizedIssues) ? result.prioritizedIssues : []

  // Generate chart data if requested
  let chartScript = ''
  if (includeCharts) {
    chartScript = `
      <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          // Category breakdown chart
          const categoryCtx = document.getElementById('categoryChart');
          if (categoryCtx) {
            new Chart(categoryCtx, {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(summary.byCategory))},
                datasets: [{
                  label: 'Issues by Category',
                  data: ${JSON.stringify(Object.values(summary.byCategory))},
                  backgroundColor: 'rgba(54, 162, 235, 0.5)',
                  borderColor: 'rgba(54, 162, 235, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                scales: {
                  y: { beginAtZero: true }
                }
              }
            });
          }

          // Impact breakdown chart
          const impactCtx = document.getElementById('impactChart');
          if (impactCtx) {
            new Chart(impactCtx, {
              type: 'doughnut',
              data: {
                labels: ${JSON.stringify(Object.keys(summary.byImpact))},
                datasets: [{
                  data: ${JSON.stringify(Object.values(summary.byImpact))},
                  backgroundColor: [
                    'rgba(255, 99, 132, 0.5)',
                    'rgba(255, 159, 64, 0.5)',
                    'rgba(255, 205, 86, 0.5)',
                    'rgba(75, 192, 192, 0.5)'
                  ]
                }]
              },
              options: {
                responsive: true
              }
            });
          }
        });
      </script>
    `
  }

  // Generate issues table rows
  const issuesRows = issues
    .map(
      (issue) => `
    <tr>
      <td>${escapeHtml(issue.ruleId)}</td>
      <td>${escapeHtml(issue.category || 'unknown')}</td>
      <td><span class="impact-${issue.impact}">${escapeHtml(issue.impact)}</span></td>
      <td>${escapeHtml(issue.wcagLevel)}</td>
      <td>${escapeHtml(issue.description)}</td>
      <td><code>${escapeHtml(issue.element)}</code></td>
      <td>${escapeHtml(issue.userImpact)}</td>
    </tr>
  `
    )
    .join('')

  // Template-specific content
  let mainContent = ''
  if (template === 'minimal') {
    mainContent = `
      <div class="summary">
        <h2>Summary</h2>
        <p>Total Issues: <strong>${summary.totalIssues}</strong></p>
        <p>Accessibility Score: <strong>${summary.score}/100</strong></p>
      </div>
      <div class="issues">
        <h2>Issues</h2>
        <table>
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Impact</th>
              <th>Description</th>
              <th>Element</th>
            </tr>
          </thead>
          <tbody>
            ${issues
              .map(
                (issue) => `
              <tr>
                <td>${escapeHtml(issue.ruleId)}</td>
                <td><span class="impact-${issue.impact}">${escapeHtml(issue.impact)}</span></td>
                <td>${escapeHtml(issue.description)}</td>
                <td><code>${escapeHtml(issue.element)}</code></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
  } else if (template === 'detailed') {
    mainContent = `
      <div class="summary">
        <h2>Summary</h2>
        <p>Total Issues: <strong>${summary.totalIssues}</strong></p>
        <p>Accessibility Score: <strong>${summary.score}/100</strong></p>
        <p>WCAG Level A Compliance: <strong>${summary.wcagCompliance.A}%</strong></p>
        <p>WCAG Level AA Compliance: <strong>${summary.wcagCompliance.AA}%</strong></p>
        <p>WCAG Level AAA Compliance: <strong>${summary.wcagCompliance.AAA}%</strong></p>
      </div>
      ${includeCharts ? `
      <div class="charts">
        <div style="width: 50%; display: inline-block;">
          <canvas id="categoryChart"></canvas>
        </div>
        <div style="width: 50%; display: inline-block;">
          <canvas id="impactChart"></canvas>
        </div>
      </div>
      ` : ''}
      <div class="issues">
        <h2>Detailed Issues</h2>
        <table>
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Category</th>
              <th>Impact</th>
              <th>WCAG Level</th>
              <th>Description</th>
              <th>Element</th>
              <th>XPath</th>
              <th>Class selector</th>
              <th>User Impact</th>
              <th>Fix Explanation</th>
              <th>Current Code</th>
              <th>Suggested Code</th>
            </tr>
          </thead>
          <tbody>
            ${issues
              .map(
                (issue) => `
              <tr>
                <td>${escapeHtml(issue.ruleId)}</td>
                <td>${escapeHtml(issue.category || 'unknown')}</td>
                <td><span class="impact-${issue.impact}">${escapeHtml(issue.impact)}</span></td>
                <td>${escapeHtml(issue.wcagLevel)}</td>
                <td>${escapeHtml(issue.description)}</td>
                <td><code>${escapeHtml(issue.element)}</code></td>
                <td><code>${escapeHtml(issue.xpath)}</code></td>
                <td><code>${escapeHtml(issue.classSelector ?? '')}</code></td>
                <td>${escapeHtml(issue.userImpact)}</td>
                <td>${escapeHtml(issue.fix?.explanation ?? '')}</td>
                <td><pre>${escapeHtml(issue.fix?.current ?? '')}</pre></td>
                <td><pre>${escapeHtml(issue.fix?.suggested ?? '')}</pre></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
  } else {
    // default template
    mainContent = `
      <div class="summary">
        <h2>Summary</h2>
        <p>Total Issues: <strong>${summary.totalIssues}</strong></p>
        <p>Accessibility Score: <strong>${summary.score}/100</strong></p>
        <p>WCAG Level A Compliance: <strong>${summary.wcagCompliance.A}%</strong></p>
        <p>WCAG Level AA Compliance: <strong>${summary.wcagCompliance.AA}%</strong></p>
        <p>WCAG Level AAA Compliance: <strong>${summary.wcagCompliance.AAA}%</strong></p>
      </div>
      ${includeCharts ? `
      <div class="charts">
        <div style="width: 50%; display: inline-block;">
          <canvas id="categoryChart"></canvas>
        </div>
        <div style="width: 50%; display: inline-block;">
          <canvas id="impactChart"></canvas>
        </div>
      </div>
      ` : ''}
      <div class="issues">
        <h2>Issues</h2>
        <table>
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Category</th>
              <th>Impact</th>
              <th>WCAG Level</th>
              <th>Description</th>
              <th>Element</th>
              <th>User Impact</th>
            </tr>
          </thead>
          <tbody>
            ${issuesRows}
          </tbody>
        </table>
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Audit Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      font-size: 2em;
    }
    .metadata {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metadata h2 {
      margin-top: 0;
      color: #667eea;
    }
    .metadata p {
      margin: 5px 0;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary h2 {
      margin-top: 0;
      color: #667eea;
    }
    .summary p {
      margin: 10px 0;
      font-size: 1.1em;
    }
    .charts {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .issues {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .issues h2 {
      margin-top: 0;
      color: #667eea;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #667eea;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:hover {
      background-color: #f9f9f9;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    pre {
      background-color: #f4f4f4;
      padding: 10px;
      border-radius: 3px;
      overflow-x: auto;
      font-size: 0.85em;
    }
    /* axe: critical, serious, moderate, minor. ACE: violation, potentialviolation, etc. */
    .impact-critical, .impact-violation {
      background-color: #ff4444;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85em;
    }
    .impact-serious, .impact-potentialviolation {
      background-color: #ff8800;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85em;
    }
    .impact-moderate, .impact-potentialrecommendation, .impact-manual {
      background-color: #ffbb00;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85em;
    }
    .impact-minor, .impact-recommendation, .impact-pass {
      background-color: #88cc00;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85em;
    }
    [class^="impact-"] {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
    }
  </style>
  ${chartScript}
</head>
<body>
  <div class="header">
    <h1>Accessibility Audit Report</h1>
  </div>
  ${metadata ? `
  <div class="metadata">
    <h2>Test Information</h2>
    ${metadata.testEngine ? `<p><strong>Test Engine:</strong> ${escapeHtml(metadata.testEngine.name)} v${escapeHtml(String(metadata.testEngine.version ?? ''))}</p>` : ''}
    ${metadata.testRunner ? `<p><strong>Test Runner:</strong> ${escapeHtml(metadata.testRunner.name)}</p>` : ''}
    ${metadata.url != null ? `<p><strong>Test URL:</strong> <a href="${escapeHtml(metadata.url)}" target="_blank">${escapeHtml(metadata.url)}</a></p>` : ''}
    ${metadata.timestamp != null ? `<p><strong>Timestamp:</strong> ${escapeHtml(String(metadata.timestamp))}</p>` : ''}
    ${metadata.testEnvironment ? `<p><strong>User Agent:</strong> ${escapeHtml(metadata.testEnvironment.userAgent ?? '')}</p><p><strong>Window Size:</strong> ${metadata.testEnvironment.windowWidth ?? ''}x${metadata.testEnvironment.windowHeight ?? ''}</p>` : ''}
  </div>
  ` : ''}
  ${mainContent}
</body>
</html>
  `
}

/**
 * export_to_html_report - Generate standalone HTML report
 * 
 * Generates a standalone HTML report with styling and optional charts.
 * 
 * @param input - Export configuration
 * @returns HTML string with embedded CSS/JS
 */
export async function exportToHtmlReport(
  input: ExportToHtmlInput
): Promise<ExportToHtmlResult> {
  const {
    results,
    template = 'default',
    includeCharts = true,
    basicAuthUsername,
    basicAuthPassword,
  } = input

  const auditResult = await auditResultFromExportInput(
    results,
    basicAuthUsername,
    basicAuthPassword,
    input
  )

  const htmlContent = generateHtmlReport(auditResult, template, includeCharts)

  return {
    html: htmlContent,
    template,
    includeCharts,
    totalIssues: auditResult.summary.totalIssues,
  }
}
