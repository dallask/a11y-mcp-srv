/**
 * Main MCP server entry point
 * WAVE Accessibility MCP Server
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

// Import error handling and progress utilities
import {
  handleErrorGracefully,
  retryWithBackoff,
  formatErrorMessage,
} from './core/error-handler.js'
import { formatTimeRemaining } from './core/progress-streamer.js'
import type { BatchAuditProgress } from './types/index.js'

/**
 * Create and configure the MCP server
 */
async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'wave-accessibility-audit',
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
                  'best-practice',
                ],
              },
              description:
                'Specific accessibility tags to check. If not provided, all tags are checked.',
            },
            waitForLoad: {
              type: 'string',
              enum: ['networkidle', 'load', 'domcontentloaded'],
              default: 'networkidle',
              description: 'Wait strategy for page loading.',
            },
            timeout: {
              type: 'number',
              default: 30,
              description: 'Timeout in seconds (default: 30).',
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
                  'best-practice',
                ],
              },
              description:
                'Specific accessibility tags to check. Applied to all URLs.',
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
                  'best-practice',
                ],
              },
              description:
                'Specific accessibility tags to check. If not provided, all tags are checked.',
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
                'WAVE rule ID (e.g., "alt_missing", "contrast", "label_missing").',
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
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case 'audit_url': {
          const auditResult = await retryWithBackoff(
            async () =>
              await auditUrl({
                url: args?.url as string,
                domain: args?.domain as string | undefined,
                tags: args?.tags as string[] | undefined,
                waitForLoad: args?.waitForLoad as
                  | 'networkidle'
                  | 'load'
                  | 'domcontentloaded'
                  | undefined,
                timeout: args?.timeout as number | undefined,
              }),
            {
              maxRetries: 2, // Fewer retries for single URL audits
            }
          )

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(auditResult, null, 2),
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
                text: JSON.stringify(response, null, 2),
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
                text: JSON.stringify(sessionResult, null, 2),
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
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(authenticatedAuditResult, null, 2),
              },
            ],
          } as CallToolResult
        }

        case 'get_accessibility_score': {
          const scoreResult = await getAccessibilityScore({
            results: args?.results as any, // Can be AuditResult or string URL
            weights: args?.weights as Record<string, number> | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(scoreResult, null, 2),
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
                text: JSON.stringify(prioritizeResult, null, 2),
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
                text: JSON.stringify(explanationResult, null, 2),
              },
            ],
          } as CallToolResult
        }

        case 'get_quick_fixes': {
          const quickFixesResult = await getQuickFixes({
            results: args?.results as any, // AuditResult or string URL
            format: args?.format as 'markdown' | 'html' | 'json' | undefined,
            includeCode: args?.includeCode as boolean | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(quickFixesResult, null, 2),
              },
            ],
          } as CallToolResult
        }

        case 'compare_accessibility': {
          const comparisonResult = await compareAccessibility({
            before: args?.before as any, // AuditResult or string URL
            after: args?.after as any, // AuditResult or string URL
            format: args?.format as 'summary' | 'detailed' | 'diff' | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(comparisonResult, null, 2),
              },
            ],
          } as CallToolResult
        }

        case 'track_accessibility': {
          const trackingResult = await trackAccessibility({
            url: args?.url as string,
            timeframe: args?.timeframe as '7d' | '30d' | '90d' | 'all' | undefined,
            metric: args?.metric as 'score' | 'issues' | 'wcag-compliance' | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(trackingResult, null, 2),
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
                text: JSON.stringify(complianceReport, null, 2),
              },
            ],
          } as CallToolResult
        }

        case 'get_wcag_compliance': {
          const wcagComplianceResult = await getWCAGCompliance({
            results: args?.results as any, // AuditResult or string URL
            level: args?.level as 'A' | 'AA' | 'AAA' | undefined,
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(wcagComplianceResult, null, 2),
              },
            ],
          } as CallToolResult
        }

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      // Use comprehensive error handling
      const errorInfo = handleErrorGracefully(error, `Tool: ${name}`)
      const errorMessage = formatErrorMessage(error, `Tool: ${name}`)

      // Log error details
      console.error(`[ERROR] ${errorMessage}`)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: errorInfo.error,
                category: errorInfo.category,
                retryable: errorInfo.retryable,
                suggestion: errorInfo.suggestion,
              },
              null,
              2
            ),
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

  console.error('WAVE Accessibility MCP Server running on stdio')
}

// Start the server
main().catch((error) => {
  console.error('Fatal error starting server:', error)
  process.exit(1)
})
