/**
 * Main MCP server entry point
 * Accessibility MCP Server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type ListToolsResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

// Import tool implementations
import { auditUrl } from './tools/audit.js'
import { shutdownSharedBrowser } from './core/shared-browser.js'
import { auditMultipleUrls } from './tools/audit.js'
import { createSession } from './tools/session.js'
import { auditWithSession } from './tools/session.js'
import { getAccessibilityScore } from './tools/analysis.js'
import { prioritizeIssues } from './tools/analysis.js'
import { explainIssue } from './tools/analysis.js'
import { getQuickFixes } from './tools/analysis.js'
import { generateComplianceReport } from './tools/analysis.js'
import { getWCAGCompliance } from './tools/analysis.js'
import { compareAccessibility } from './tools/comparison.js'
import { trackAccessibility } from './tools/comparison.js'
import { exportToCsv } from './tools/export.js'
import { exportToExcel } from './tools/export.js'
import { exportToJson } from './tools/export.js'
import { exportToHtmlReport } from './tools/export.js'
import { filterIssues } from './tools/filter.js'
import { searchIssues } from './tools/filter.js'
import { aggregateAuditResults } from './tools/aggregate.js'
import { getStatistics } from './tools/aggregate.js'
import { generateDashboard } from './tools/visualize.js'
import { generateSummaryReport } from './tools/visualize.js'

// Import error handling and progress utilities
import {
  handleErrorGracefully,
  retryWithBackoff,
  formatErrorMessage,
  toErrorMessage,
} from './core/error-handler.js'
import { formatTimeRemaining } from './core/progress-streamer.js'
import type { BatchAuditProgress } from './types/index.js'

/** MCP inputSchema fragment: same URL-audit options as audit_url when export* `results` is a URL. */
const EXPORT_URL_AUDIT_SCHEMA_PROPERTIES = {
  domain: {
    type: 'string',
    description:
      'When results is a URL: base domain if the URL is relative (same as audit_url).',
  },
  tags: {
    type: 'array',
    items: {
      type: 'string',
      enum: [
        'wcag2a',
        'wcag2aa',
        'wcag2aaa',
        'wcag21a',
        'wcag21aa',
        'wcag21aaa',
        'wcag22a',
        'wcag22aa',
        'wcag22aaa',
        'best-practice',
      ],
    },
    description:
      'When results is a URL: WCAG tags (same as audit_url). If omitted, env WCAG_LEVEL applies.',
  },
  engine: {
    type: 'string',
    enum: ['axe', 'ace'],
    description:
      'When results is a URL: axe (axe-core) or ace (IBM Equal Access). Overrides env A11Y_ENGINE.',
  },
  waitForLoad: {
    type: 'string',
    enum: ['networkidle', 'load', 'domcontentloaded'],
    default: 'load',
    description:
      'When results is a URL: page load wait (same as audit_url). Default load.',
  },
  timeout: {
    type: 'number',
    default: 30,
    description: 'When results is a URL: timeout in seconds (same as audit_url).',
  },
  includeRawResults: {
    type: 'boolean',
    default: false,
    description:
      'When results is a URL: include full engine output in audit rawResults (default: false; smaller payloads).',
  },
} as const

/**
 * Tool result with JSON text plus an embedded resource for download (MCP `resource` content block).
 */
function callToolResultWithEmbeddedExport(
  payload: unknown,
  resource:
    | { filename: string; mimeType: string; text: string }
    | { filename: string; mimeType: string; blob: string }
): CallToolResult {
  const uri = `a11y-mcp://export/${encodeURIComponent(resource.filename)}`
  if ('blob' in resource) {
    return {
      content: [
        { type: 'text', text: JSON.stringify(payload) },
        {
          type: 'resource',
          resource: {
            uri,
            mimeType: resource.mimeType,
            blob: resource.blob,
          },
        },
      ],
    } as CallToolResult
  }
  return {
    content: [
      { type: 'text', text: JSON.stringify(payload) },
      {
        type: 'resource',
        resource: {
          uri,
          mimeType: resource.mimeType,
          text: resource.text,
        },
      },
    ],
  } as CallToolResult
}

/**
 * Create and configure the MCP server
 */
export async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'accessibility-audit',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: 'audit_url',
        description:
          'Test a single URL for accessibility issues. Returns structured, conversational results with prioritized issues and fix suggestions.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'Full URL or relative path to test. If relative, domain must be provided.',
            },
            domain: {
              type: 'string',
              description:
                'Base domain if URL is relative (e.g., "https://example.com").',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'wcag2a',
                  'wcag2aa',
                  'wcag2aaa',
                  'wcag21a',
                  'wcag21aa',
                  'wcag21aaa',
                  'wcag22a',
                  'wcag22aa',
                  'wcag22aaa',
                  'best-practice',
                ],
              },
              description:
                'Specific accessibility tags to check. If not provided, tags from env WCAG_LEVEL and BEST_PRACTICES are used.',
            },
            engine: {
              type: 'string',
              enum: ['axe', 'ace'],
              description:
                'Testing engine: "axe" (axe-core, default) or "ace" (IBM Equal Access). Overrides env A11Y_ENGINE when provided.',
            },
            waitForLoad: {
              type: 'string',
              enum: ['networkidle', 'load', 'domcontentloaded'],
              default: 'load',
              description:
                'Wait strategy for page loading. Default load; use networkidle for heavy SPAs when dynamic content must settle.',
            },
            timeout: {
              type: 'number',
              default: 30,
              description: 'Timeout in seconds (default: 30).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username. Use with basicAuthPassword for sites that require Basic Authentication.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password. Use with basicAuthUsername for sites that require Basic Authentication.',
            },
            includeRawResults: {
              type: 'boolean',
              default: false,
              description:
                'When true, include full engine output in rawResults (default: false; omit for smaller MCP payloads).',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'audit_multiple_urls',
        description:
          'Test multiple URLs efficiently with optional parallel processing and progress tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            urls: {
              oneOf: [
                {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of URLs to test.',
                },
                {
                  type: 'string',
                  description:
                    'Comma-separated string of URLs to test.',
                },
              ],
              description: 'URLs to test (array or comma-separated string).',
            },
            domain: {
              type: 'string',
              description:
                'Base domain if URLs are relative (e.g., "https://example.com").',
            },
            parallel: {
              type: 'number',
              default: 1,
              description:
                'Number of parallel tests to run (default: 1).',
            },
            continueOnError: {
              type: 'boolean',
              default: true,
              description:
                'Continue processing if one URL fails (default: true).',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'wcag2a',
                  'wcag2aa',
                  'wcag2aaa',
                  'wcag21a',
                  'wcag21aa',
                  'wcag21aaa',
                  'wcag22a',
                  'wcag22aa',
                  'wcag22aaa',
                  'best-practice',
                ],
              },
              description:
                'Specific accessibility tags to check. Applied to all URLs. If not provided, env WCAG_LEVEL and BEST_PRACTICES are used.',
            },
            engine: {
              type: 'string',
              enum: ['axe', 'ace'],
              description:
                'Testing engine: "axe" or "ace". Overrides env A11Y_ENGINE when provided.',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username for all URLs. Use with basicAuthPassword when sites require Basic Authentication.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password. Use with basicAuthUsername.',
            },
            includeRawResults: {
              type: 'boolean',
              default: false,
              description:
                'When true, each successful URL result includes rawResults (default: false).',
            },
          },
          required: ['urls'],
        },
      },
      {
        name: 'create_session',
        description:
          'Create a reusable authenticated session by logging into a website. The session can be reused for multiple audits of protected pages.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description:
                'Base domain (e.g., "https://example.com" or "example.com").',
            },
            loginUrl: {
              type: 'string',
              description:
                'Custom login URL. If not provided, defaults to {domain}/login.',
            },
            username: {
              type: 'string',
              description: 'Login username.',
            },
            password: {
              type: 'string',
              description: 'Login password.',
            },
            loginSelectors: {
              type: 'object',
              properties: {
                usernameSelector: {
                  type: 'string',
                  description:
                    'CSS selector for username input field.',
                },
                passwordSelector: {
                  type: 'string',
                  description:
                    'CSS selector for password input field.',
                },
                submitSelector: {
                  type: 'string',
                  description: 'CSS selector for submit button.',
                },
                successIndicator: {
                  type: 'string',
                  description:
                    'CSS selector that appears after successful login.',
                },
              },
              description:
                'Custom selectors for login form. If not provided, defaults are used.',
            },
            sessionId: {
              type: 'string',
              description:
                'Custom session identifier. If not provided, one is generated.',
            },
          },
          required: ['domain', 'username', 'password'],
        },
      },
      {
        name: 'audit_with_session',
        description:
          'Run an accessibility audit on a URL using an existing authenticated session. This allows testing protected pages without re-authenticating for each audit.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description:
                'Session ID from create_session tool.',
            },
            url: {
              type: 'string',
              description:
                'Full URL or relative path to test. If relative, domain must be provided.',
            },
            domain: {
              type: 'string',
              description:
                'Base domain if URL is relative. If not provided, uses session domain.',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'wcag2a',
                  'wcag2aa',
                  'wcag2aaa',
                  'wcag21a',
                  'wcag21aa',
                  'wcag21aaa',
                  'wcag22a',
                  'wcag22aa',
                  'wcag22aaa',
                  'best-practice',
                ],
              },
              description:
                'Specific accessibility tags to check. If not provided, tags from env WCAG_LEVEL and BEST_PRACTICES are used (same as audit_url).',
            },
            waitForLoad: {
              type: 'string',
              enum: ['networkidle', 'load', 'domcontentloaded'],
              default: 'load',
              description:
                'Wait strategy for page loading. Default load; use networkidle for heavy SPAs.',
            },
            timeout: {
              type: 'number',
              default: 30,
              description: 'Timeout in seconds (default: 30).',
            },
            engine: {
              type: 'string',
              enum: ['axe', 'ace'],
              description:
                'Testing engine: "axe" (axe-core, default) or "ace" (IBM Equal Access). Overrides env A11Y_ENGINE when provided.',
            },
            includeRawResults: {
              type: 'boolean',
              default: false,
              description:
                'When true, include full engine output in rawResults (default: false).',
            },
          },
          required: ['sessionId', 'url'],
        },
      },
      {
        name: 'get_accessibility_score',
        description:
          'Calculate accessibility score (0-100) from audit results with detailed breakdowns by category and WCAG compliance levels. Supports custom weights for different issue types.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and score. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            weights: {
              type: 'object',
              additionalProperties: {
                type: 'number',
              },
              description:
                'Custom weights for different issue types (e.g., {"critical": 5.0, "serious": 3.0}). If not provided, default weights are used.',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'prioritize_issues',
        description:
          'Intelligently prioritize accessibility issues based on specified criteria, identifying quick wins (easy fixes with high impact) and critical blockers (must fix before launch).',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              type: 'object',
              description: 'Audit result object from a previous audit.',
            },
            criteria: {
              type: 'string',
              enum: ['impact', 'wcag', 'fixability', 'user-impact'],
              default: 'impact',
              description:
                'Prioritization criteria: "impact" (by impact level), "wcag" (by WCAG compliance level), "fixability" (by ease of fix), or "user-impact" (by user experience impact).',
            },
            limit: {
              type: 'number',
              description:
                'Top N issues to return. If not provided, all issues are returned.',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'explain_issue',
        description:
          'Explain what an accessibility issue means in plain language. Provides educational information including why it matters, how to fix it, WCAG references, and code examples.',
        inputSchema: {
          type: 'object',
          properties: {
            ruleId: {
              type: 'string',
              description:
                'Accessibility rule ID (e.g., "alt_missing", "contrast", "label_missing").',
            },
            context: {
              type: 'string',
              description:
                'Additional context about the issue (optional). Can include element information or specific circumstances.',
            },
          },
          required: ['ruleId'],
        },
      },
      {
        name: 'get_quick_fixes',
        description:
          'Get specific fix suggestions with before/after code examples from audit results. Returns actionable fixes formatted as markdown, HTML, or JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and get fixes for. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            format: {
              type: 'string',
              enum: ['markdown', 'html', 'json'],
              default: 'json',
              description:
                'Output format: "markdown" for markdown-formatted fixes, "html" for HTML format, or "json" for structured data (default: json).',
            },
            includeCode: {
              type: 'boolean',
              default: true,
              description:
                'Include before/after code examples in the fixes (default: true).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'compare_accessibility',
        description:
          'Compare two accessibility audits to track improvements. Identifies issues that were fixed, introduced, or remain, with score improvement and visual diff summary.',
        inputSchema: {
          type: 'object',
          properties: {
            before: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Previous audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL of the previous audit. If provided, an audit will be run first.',
                },
              ],
              description:
                'Previous audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            after: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Current audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL of the current audit. If provided, an audit will be run first.',
                },
              ],
              description:
                'Current audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            format: {
              type: 'string',
              enum: ['summary', 'detailed', 'diff'],
              default: 'summary',
              description:
                'Output format: "summary" for concise comparison, "detailed" or "diff" for comprehensive diff visualization (default: summary).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when before/after are URLs. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when before/after are URLs. Use with basicAuthUsername.',
            },
          },
          required: ['before', 'after'],
        },
      },
      {
        name: 'track_accessibility',
        description:
          'Track accessibility metrics over time with trend analysis, predictions, and recommendations. Stores audit results for historical comparison.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to track accessibility metrics for.',
            },
            timeframe: {
              type: 'string',
              enum: ['7d', '30d', '90d', 'all'],
              default: '30d',
              description:
                'Timeframe for historical data: "7d" (7 days), "30d" (30 days), "90d" (90 days), or "all" (all available data). Default: 30d.',
            },
            metric: {
              type: 'string',
              enum: ['score', 'issues', 'wcag-compliance'],
              default: 'score',
              description:
                'Metric to track: "score" (accessibility score 0-100), "issues" (total number of issues), or "wcag-compliance" (average WCAG compliance percentage). Default: score.',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username for url. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password for url. Use with basicAuthUsername.',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'generate_compliance_report',
        description:
          'Generate compliance reports in VPAT, WCAG, ADA, or Section 508 format. Includes WCAG criterion mapping, compliance percentages, executive summary, and optional remediation plan.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              type: 'object',
              description: 'Audit result object from a previous audit.',
            },
            format: {
              type: 'string',
              enum: ['VPAT', 'WCAG', 'ADA', 'Section508'],
              default: 'WCAG',
              description:
                'Report format: "VPAT" (Voluntary Product Accessibility Template), "WCAG" (WCAG compliance report), "ADA" (Americans with Disabilities Act report), or "Section508" (Section 508 compliance report). Default: WCAG.',
            },
            level: {
              type: 'string',
              enum: ['A', 'AA', 'AAA'],
              default: 'AA',
              description:
                'WCAG compliance level to assess: "A", "AA", or "AAA". Default: AA.',
            },
            includeRemediation: {
              type: 'boolean',
              default: false,
              description:
                'Include remediation plan with fix suggestions in the report (default: false).',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'get_wcag_compliance',
        description:
          'Check WCAG compliance status with detailed per-criterion breakdown. Returns compliance status (pass/fail/partial), compliance percentage, violations per criterion, and missing requirements.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and check compliance for. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            level: {
              type: 'string',
              enum: ['A', 'AA', 'AAA'],
              default: 'AA',
              description:
                'WCAG compliance level to check: "A", "AA", or "AAA". Default: AA.',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'export_to_csv',
        description:
          'Export audit results to CSV format for spreadsheet analysis. Includes metadata section and violation rows. Returns JSON (including CSV text) plus an embedded CSV resource for download in supporting clients.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and export. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            includeMetadata: {
              type: 'boolean',
              default: true,
              description:
                'Include test information and environment data (default: true).',
            },
            includeViolations: {
              type: 'boolean',
              default: true,
              description: 'Include detailed violation rows (default: true).',
            },
            format: {
              type: 'string',
              enum: ['standard', 'detailed', 'minimal'],
              default: 'standard',
              description:
                'Export format: "standard" (default), "detailed" (includes all fields), or "minimal" (essential fields only).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
            ...EXPORT_URL_AUDIT_SCHEMA_PROPERTIES,
          },
          required: ['results'],
        },
      },
      {
        name: 'export_to_excel',
        description:
          'Export audit results to Excel/XLSX format with formatting. Requires xlsx package. Returns JSON (including base64 file data) plus an embedded XLSX resource for download in supporting clients.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and export. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            includeCharts: {
              type: 'boolean',
              default: false,
              description:
                'Generate charts for score trends and category breakdown (default: false).',
            },
            formatting: {
              type: 'boolean',
              default: true,
              description: 'Apply colors, headers, and styling (default: true).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
            ...EXPORT_URL_AUDIT_SCHEMA_PROPERTIES,
          },
          required: ['results'],
        },
      },
      {
        name: 'export_to_json',
        description:
          'Export audit results as structured JSON. Supports pretty-printing and optional raw results. Returns JSON plus an embedded JSON file resource for download in supporting clients.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and export. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            pretty: {
              type: 'boolean',
              default: true,
              description: 'Pretty-print JSON (default: true).',
            },
            includeRaw: {
              type: 'boolean',
              default: false,
              description:
                'Include raw accessibility engine results (default: false).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
            ...EXPORT_URL_AUDIT_SCHEMA_PROPERTIES,
          },
          required: ['results'],
        },
      },
      {
        name: 'export_to_html_report',
        description:
          'Generate standalone HTML report with styling. Includes optional visual charts. Returns JSON plus an embedded HTML resource for download in supporting clients.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and export. If provided, an audit will be run first.',
                },
              ],
              description:
                'Audit results object or URL string. If URL is provided, an audit will be run first.',
            },
            template: {
              type: 'string',
              enum: ['default', 'minimal', 'detailed'],
              default: 'default',
              description:
                'Report template: "default" (standard report), "minimal" (essential info only), or "detailed" (comprehensive report).',
            },
            includeCharts: {
              type: 'boolean',
              default: true,
              description: 'Include visual charts (default: true).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
            ...EXPORT_URL_AUDIT_SCHEMA_PROPERTIES,
          },
          required: ['results'],
        },
      },
      {
        name: 'filter_issues',
        description:
          'Filter issues from audit results by various criteria (rule IDs, categories, impact levels, WCAG levels, etc.). Supports include/exclude modes.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              type: 'object',
              description: 'Audit result object from a previous audit.',
            },
            filters: {
              type: 'object',
              properties: {
                ruleIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of rule IDs to include/exclude.',
                },
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of categories (error, contrast, etc.).',
                },
                impactLevels: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Array of impact levels to filter by. axe: critical, serious, moderate, minor. ACE: violation, potentialviolation, potentialrecommendation, recommendation, manual, pass.',
                },
                wcagLevels: {
                  type: 'array',
                  items: { type: 'string', enum: ['A', 'AA', 'AAA'] },
                  description: 'Array of WCAG levels to filter by.',
                },
                minCount: {
                  type: 'number',
                  description: 'Minimum occurrence count for an issue to be included.',
                },
                elementTypes: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Filter by HTML element types (e.g., ["img", "input", "button"]).',
                },
              },
              description: 'Filter criteria object.',
            },
            mode: {
              type: 'string',
              enum: ['include', 'exclude'],
              default: 'include',
              description:
                'Filter mode: "include" (only include matching issues) or "exclude" (exclude matching issues).',
            },
          },
          required: ['results', 'filters'],
        },
      },
      {
        name: 'search_issues',
        description:
          'Search issues by text content, selector, XPath, or description. Supports case-sensitive and case-insensitive search.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              type: 'object',
              description: 'Audit result object from a previous audit.',
            },
            query: {
              type: 'string',
              description: 'Search query string.',
            },
            fields: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'description',
                  'element',
                  'xpath',
                  'selector',
                  'ruleId',
                  'userImpact',
                  'fix',
                  'all',
                ],
              },
              default: ['all'],
              description:
                'Fields to search: "description", "element", "xpath", "selector", "ruleId", "userImpact", "fix", or "all" (default: ["all"]).',
            },
            caseSensitive: {
              type: 'boolean',
              default: false,
              description: 'Case-sensitive search (default: false).',
            },
          },
          required: ['results', 'query'],
        },
      },
      {
        name: 'aggregate_audit_results',
        description:
          'Combine and aggregate multiple audit results. Groups issues by URL, category, rule, or none, and provides aggregated summary statistics.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                description: 'Audit result object from a previous audit.',
              },
              description: 'Array of audit result objects to aggregate.',
            },
            groupBy: {
              type: 'string',
              enum: ['url', 'category', 'rule', 'none'],
              default: 'url',
              description:
                'Grouping strategy: "url" (group by URL), "category" (group by category), "rule" (group by rule ID), or "none" (no grouping). Default: "url".',
            },
            includeSummary: {
              type: 'boolean',
              default: true,
              description:
                'Include aggregated summary statistics (default: true).',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'get_statistics',
        description:
          'Generate detailed statistics from audit results with breakdowns by category, impact, WCAG level, or rule ID. Supports single or multiple audit results.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    description: 'Audit result object from a previous audit.',
                  },
                  description: 'Array of audit result objects.',
                },
              ],
              description:
                'Audit result object or array of audit results to analyze.',
            },
            breakdown: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['category', 'impact', 'wcag', 'rule'],
              },
              default: ['category', 'impact', 'wcag', 'rule'],
              description:
                'Array of breakdown dimensions: "category", "impact", "wcag", "rule". Default: all dimensions.',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'generate_dashboard',
        description:
          'Create a visual dashboard summary of audit results with key metrics, charts, and summaries. Supports multiple formats (text, markdown, HTML, JSON) and optional charts.',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    description: 'Audit result object from a previous audit.',
                  },
                  description: 'Array of audit result objects.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and generate dashboard for. If provided, an audit will be run first.',
                },
                {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of URLs to audit and generate dashboard for.',
                },
              ],
              description:
                'Audit result object(s) or URL string(s). If URL(s) provided, audit(s) will be run first.',
            },
            format: {
              type: 'string',
              enum: ['text', 'markdown', 'html', 'json'],
              default: 'markdown',
              description:
                'Output format: "text" (plain text), "markdown" (markdown format), "html" (HTML report), or "json" (structured JSON). Default: "markdown".',
            },
            includeCharts: {
              type: 'boolean',
              default: true,
              description:
                'Include ASCII/text charts in the dashboard (default: true).',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
          },
          required: ['results'],
        },
      },
      {
        name: 'generate_summary_report',
        description:
          'Generate executive summary report with key findings and recommendations. Supports multiple formats (text, markdown, HTML) and detail levels (executive, detailed, technical).',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Audit result object from a previous audit.',
                },
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    description: 'Audit result object from a previous audit.',
                  },
                  description: 'Array of audit result objects.',
                },
                {
                  type: 'string',
                  description: 'URL to audit and generate report for. If provided, an audit will be run first.',
                },
                {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of URLs to audit and generate report for.',
                },
              ],
              description:
                'Audit result object(s) or URL string(s). If URL(s) provided, audit(s) will be run first.',
            },
            format: {
              type: 'string',
              enum: ['text', 'markdown', 'html'],
              default: 'markdown',
              description:
                'Output format: "text" (plain text), "markdown" (markdown format), or "html" (HTML report). Default: "markdown".',
            },
            level: {
              type: 'string',
              enum: ['executive', 'detailed', 'technical'],
              default: 'executive',
              description:
                'Detail level: "executive" (high-level summary for executives), "detailed" (comprehensive summary with breakdowns), or "technical" (technical details for developers). Default: "executive".',
            },
            basicAuthUsername: {
              type: 'string',
              description:
                'HTTP Basic Auth username when results is a URL. Use with basicAuthPassword. Can be embedded in URL as https://user:password@host/.',
            },
            basicAuthPassword: {
              type: 'string',
              description:
                'HTTP Basic Auth password when results is a URL. Use with basicAuthUsername.',
            },
          },
          required: ['results'],
        },
      },
    ]

    return {
      tools,
    } as ListToolsResult
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    let { name, arguments: rawArgs } = request.params
    // Some MCP clients send arguments as a JSON string; normalize to an object so args?.results etc. work
    let args: Record<string, unknown> =
      typeof rawArgs === 'string'
        ? (() => {
            try {
              return JSON.parse(rawArgs) as Record<string, unknown>
            } catch {
              return {}
            }
          })()
        : rawArgs != null && typeof rawArgs === 'object'
          ? (rawArgs as Record<string, unknown>)
          : {}

    try {
      switch (name) {
        case 'audit_url': {
          const auditResult = await retryWithBackoff(
            async () =>
              await auditUrl({
                url: args?.url as string,
                domain: args?.domain as string | undefined,
                tags: args?.tags as string[] | undefined,
                engine: args?.engine as 'axe' | 'ace' | undefined,
                waitForLoad: args?.waitForLoad as
                  | 'networkidle'
                  | 'load'
                  | 'domcontentloaded'
                  | undefined,
                timeout: args?.timeout as number | undefined,
                basicAuthUsername: args?.basicAuthUsername as string | undefined,
                basicAuthPassword: args?.basicAuthPassword as string | undefined,
                includeRawResults: args?.includeRawResults === true,
              }),
            {
              maxRetries: 2, // Fewer retries for single URL audits
            }
          )

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(auditResult),
              },
            ],
          } as CallToolResult
        }

        case 'audit_multiple_urls': {
          // Collect progress updates for streaming
          const progressUpdates: BatchAuditProgress[] = []

          // Create progress callback that logs and collects updates
          const progressCallback = (progress: BatchAuditProgress) => {
            progressUpdates.push(progress)
            // Log progress to stderr so MCP clients can capture it
            const timeRemainingText = progress.estimatedTimeRemaining
              ? ` (estimated ${formatTimeRemaining(progress.estimatedTimeRemaining)} remaining)`
              : ''
            console.error(
              `[PROGRESS] ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.status}${timeRemainingText}`
            )
          }

          const batchResult = await retryWithBackoff(
            async () =>
              await auditMultipleUrls(
                {
                  urls: args?.urls as string[] | string,
                  domain: args?.domain as string | undefined,
                  parallel: args?.parallel as number | undefined,
                  continueOnError: args?.continueOnError as boolean | undefined,
                  tags: args?.tags as string[] | undefined,
                  engine: args?.engine as 'axe' | 'ace' | undefined,
                  basicAuthUsername: args?.basicAuthUsername as string | undefined,
                  basicAuthPassword: args?.basicAuthPassword as string | undefined,
                  includeRawResults: args?.includeRawResults === true,
                },
                progressCallback
              ),
            {
              maxRetries: 1, // Only retry once for batch operations
            }
          )

          // Include progress history in response
          const response = {
            ...batchResult,
            progressHistory: progressUpdates,
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response),
              },
            ],
          } as CallToolResult
        }

        case 'create_session': {
          const sessionResult = await createSession({
            domain: args?.domain as string,
            loginUrl: args?.loginUrl as string | undefined,
            username: args?.username as string,
            password: args?.password as string,
            loginSelectors: args?.loginSelectors as
              | {
                  usernameSelector?: string
                  passwordSelector?: string
                  submitSelector?: string
                  successIndicator?: string
                }
              | undefined,
            sessionId: args?.sessionId as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(sessionResult),
              },
            ],
          } as CallToolResult
        }

        case 'audit_with_session': {
          const authenticatedAuditResult = await auditWithSession({
            sessionId: args?.sessionId as string,
            url: args?.url as string,
            domain: args?.domain as string | undefined,
            tags: args?.tags as string[] | undefined,
            waitForLoad: args?.waitForLoad as
              | 'networkidle'
              | 'load'
              | 'domcontentloaded'
              | undefined,
            timeout: args?.timeout as number | undefined,
            engine: args?.engine as 'axe' | 'ace' | undefined,
            includeRawResults: args?.includeRawResults === true,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(authenticatedAuditResult),
              },
            ],
          } as CallToolResult
        }

        case 'get_accessibility_score': {
          const scoreResult = await getAccessibilityScore({
            results: args?.results as any, // Can be AuditResult or string URL
            weights: args?.weights as Record<string, number> | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(scoreResult),
              },
            ],
          } as CallToolResult
        }

        case 'prioritize_issues': {
          const prioritizeResult = prioritizeIssues({
            results: args?.results as any, // AuditResult
            criteria: args?.criteria as
              | 'impact'
              | 'wcag'
              | 'fixability'
              | 'user-impact'
              | undefined,
            limit: args?.limit as number | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(prioritizeResult),
              },
            ],
          } as CallToolResult
        }

        case 'explain_issue': {
          const explanationResult = explainIssue({
            ruleId: args?.ruleId as string,
            context: args?.context as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(explanationResult),
              },
            ],
          } as CallToolResult
        }

        case 'get_quick_fixes': {
          const quickFixesResult = await getQuickFixes({
            results: args?.results as any, // AuditResult or string URL
            format: args?.format as 'markdown' | 'html' | 'json' | undefined,
            includeCode: args?.includeCode as boolean | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(quickFixesResult),
              },
            ],
          } as CallToolResult
        }

        case 'compare_accessibility': {
          const comparisonResult = await compareAccessibility({
            before: args?.before as any, // AuditResult or string URL
            after: args?.after as any, // AuditResult or string URL
            format: args?.format as 'summary' | 'detailed' | 'diff' | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(comparisonResult),
              },
            ],
          } as CallToolResult
        }

        case 'track_accessibility': {
          const trackingResult = await trackAccessibility({
            url: args?.url as string,
            timeframe: args?.timeframe as '7d' | '30d' | '90d' | 'all' | undefined,
            metric: args?.metric as 'score' | 'issues' | 'wcag-compliance' | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(trackingResult),
              },
            ],
          } as CallToolResult
        }

        case 'generate_compliance_report': {
          const complianceReport = generateComplianceReport({
            results: args?.results as any, // AuditResult
            format: args?.format as 'VPAT' | 'WCAG' | 'ADA' | 'Section508' | undefined,
            level: args?.level as 'A' | 'AA' | 'AAA' | undefined,
            includeRemediation: args?.includeRemediation as boolean | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(complianceReport),
              },
            ],
          } as CallToolResult
        }

        case 'get_wcag_compliance': {
          const wcagComplianceResult = await getWCAGCompliance({
            results: args?.results as any, // AuditResult or string URL
            level: args?.level as 'A' | 'AA' | 'AAA' | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(wcagComplianceResult),
              },
            ],
          } as CallToolResult
        }

        case 'export_to_csv': {
          const csvResult = await exportToCsv({
            results: args?.results as any, // AuditResult or string URL
            includeMetadata: args?.includeMetadata as boolean | undefined,
            includeViolations: args?.includeViolations as boolean | undefined,
            format: args?.format as 'standard' | 'detailed' | 'minimal' | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
            domain: args?.domain as string | undefined,
            tags: args?.tags as string[] | undefined,
            engine: args?.engine as 'axe' | 'ace' | undefined,
            waitForLoad: args?.waitForLoad as
              | 'networkidle'
              | 'load'
              | 'domcontentloaded'
              | undefined,
            timeout: args?.timeout as number | undefined,
            includeRawResults: args?.includeRawResults === true,
          })

          return callToolResultWithEmbeddedExport(csvResult, {
            filename: csvResult.filename ?? 'accessibility-audit.csv',
            mimeType: csvResult.mimeType ?? 'text/csv; charset=utf-8',
            text: csvResult.csv,
          })
        }

        case 'export_to_excel': {
          const excelResult = await exportToExcel({
            results: args?.results as any, // AuditResult or string URL
            includeCharts: args?.includeCharts as boolean | undefined,
            formatting: args?.formatting as boolean | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
            domain: args?.domain as string | undefined,
            tags: args?.tags as string[] | undefined,
            engine: args?.engine as 'axe' | 'ace' | undefined,
            waitForLoad: args?.waitForLoad as
              | 'networkidle'
              | 'load'
              | 'domcontentloaded'
              | undefined,
            timeout: args?.timeout as number | undefined,
            includeRawResults: args?.includeRawResults === true,
          })

          return callToolResultWithEmbeddedExport(excelResult, {
            filename: excelResult.filename ?? 'accessibility-audit.xlsx',
            mimeType:
              excelResult.mimeType ??
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            blob: excelResult.excel,
          })
        }

        case 'export_to_json': {
          const jsonResult = await exportToJson({
            results: args?.results as any, // AuditResult or string URL
            pretty: args?.pretty as boolean | undefined,
            includeRaw: args?.includeRaw as boolean | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
            domain: args?.domain as string | undefined,
            tags: args?.tags as string[] | undefined,
            engine: args?.engine as 'axe' | 'ace' | undefined,
            waitForLoad: args?.waitForLoad as
              | 'networkidle'
              | 'load'
              | 'domcontentloaded'
              | undefined,
            timeout: args?.timeout as number | undefined,
            includeRawResults: args?.includeRawResults === true,
          })

          return callToolResultWithEmbeddedExport(jsonResult, {
            filename: jsonResult.filename ?? 'accessibility-audit.json',
            mimeType: jsonResult.mimeType ?? 'application/json; charset=utf-8',
            text: jsonResult.json,
          })
        }

        case 'export_to_html_report': {
          const htmlResult = await exportToHtmlReport({
            results: args?.results as any, // AuditResult or string URL
            template: args?.template as 'default' | 'minimal' | 'detailed' | undefined,
            includeCharts: args?.includeCharts as boolean | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
            domain: args?.domain as string | undefined,
            tags: args?.tags as string[] | undefined,
            engine: args?.engine as 'axe' | 'ace' | undefined,
            waitForLoad: args?.waitForLoad as
              | 'networkidle'
              | 'load'
              | 'domcontentloaded'
              | undefined,
            timeout: args?.timeout as number | undefined,
            includeRawResults: args?.includeRawResults === true,
          })

          return callToolResultWithEmbeddedExport(htmlResult, {
            filename: htmlResult.filename ?? 'accessibility-audit.html',
            mimeType: htmlResult.mimeType ?? 'text/html; charset=utf-8',
            text: htmlResult.html,
          })
        }

        case 'filter_issues': {
          const filterResult = filterIssues({
            results: args?.results as any, // AuditResult
            filters: args?.filters as any, // FilterCriteria
            mode: args?.mode as 'include' | 'exclude' | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(filterResult),
              },
            ],
          } as CallToolResult
        }

        case 'search_issues': {
          const searchResult = searchIssues({
            results: args?.results as any, // AuditResult
            query: args?.query as string,
            fields: args?.fields as any, // Array of field names
            caseSensitive: args?.caseSensitive as boolean | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(searchResult),
              },
            ],
          } as CallToolResult
        }

        case 'aggregate_audit_results': {
          const aggregateResult = aggregateAuditResults({
            results: args?.results as any[], // Array of AuditResult
            groupBy: args?.groupBy as 'url' | 'category' | 'rule' | 'none' | undefined,
            includeSummary: args?.includeSummary as boolean | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(aggregateResult),
              },
            ],
          } as CallToolResult
        }

        case 'get_statistics': {
          const statisticsResult = getStatistics({
            results: args?.results as any, // AuditResult or AuditResult[]
            breakdown: args?.breakdown as ('category' | 'impact' | 'wcag' | 'rule')[] | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(statisticsResult),
              },
            ],
          } as CallToolResult
        }

        case 'generate_dashboard': {
          const dashboardResult = await generateDashboard({
            results: args?.results as any, // AuditResult | AuditResult[] | string | string[]
            format: args?.format as 'text' | 'markdown' | 'html' | 'json' | undefined,
            includeCharts: args?.includeCharts as boolean | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(dashboardResult),
              },
            ],
          } as CallToolResult
        }

        case 'generate_summary_report': {
          const summaryReportResult = await generateSummaryReport({
            results: args?.results as any, // AuditResult | AuditResult[] | string | string[]
            format: args?.format as 'text' | 'markdown' | 'html' | undefined,
            level: args?.level as 'executive' | 'detailed' | 'technical' | undefined,
            basicAuthUsername: args?.basicAuthUsername as string | undefined,
            basicAuthPassword: args?.basicAuthPassword as string | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(summaryReportResult),
              },
            ],
          } as CallToolResult
        }

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      // Use comprehensive error handling; ensure error text is never [object Object]
      let errorPayload: {
        error: string
        category: string
        retryable: boolean
        suggestion?: string
      }
      try {
        const errorInfo = handleErrorGracefully(error, `Tool: ${name}`)
        const errorMessage = formatErrorMessage(error, `Tool: ${name}`)
        console.error(`[ERROR] ${errorMessage}`)
        const errText =
          typeof errorInfo.error === 'string'
            ? errorInfo.error
            : toErrorMessage(errorInfo.error ?? error)
        errorPayload = {
          error: errText,
          category: errorInfo.category,
          retryable: errorInfo.retryable,
          suggestion: errorInfo.suggestion,
        }
      } catch (fallbackError) {
        errorPayload = {
          error: toErrorMessage(error),
          category: 'unknown',
          retryable: false,
          suggestion: 'An unexpected error occurred. Please try again.',
        }
        console.error(`[ERROR] ${errorPayload.error}`)
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorPayload),
          },
        ],
        isError: true,
      } as CallToolResult
    }
  })

  return server
}

/**
 * Main entry point
 */
async function main() {
  const server = await createServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)

  console.error('Accessibility MCP Server running on stdio')

  const onShutdown = () => {
    void shutdownSharedBrowser()
  }
  process.once('SIGINT', onShutdown)
  process.once('SIGTERM', onShutdown)
}

// Start the server
main().catch((error) => {
  console.error('Fatal error starting server:', error)
  process.exit(1)
})
