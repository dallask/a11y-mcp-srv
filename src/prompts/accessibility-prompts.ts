/**
 * MCP protocol prompts: reusable, parameterized templates returned via
 * `prompts/list` and `prompts/get`. Each prompt guides multi-step use of this
 * server's tools (see `src/server.ts` tool registrations).
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import type { GetPromptResult, Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js'

type PromptArgs = Record<string, string | undefined>

function requireArg(args: PromptArgs, key: string): string {
  const v = args[key]?.trim()
  if (!v) {
    throw new McpError(ErrorCode.InvalidParams, `Missing required prompt argument: ${key}`)
  }
  return v
}

function optionalArg(args: PromptArgs, key: string, defaultValue: string): string {
  const v = args[key]?.trim()
  return v && v.length > 0 ? v : defaultValue
}

function userMessage(text: string): PromptMessage {
  return { role: 'user', content: { type: 'text', text } }
}

/** Metadata advertised in `prompts/list` (must match `getAccessibilityPrompt` names). */
export const ACCESSIBILITY_PROMPT_LIST: readonly Prompt[] = [
  {
    name: 'audit-single-url',
    description: 'Run one accessibility audit on a public URL (audit_url).',
    arguments: [
      { name: 'url', description: 'Full https URL to audit', required: true },
      {
        name: 'engine',
        description: 'axe or ace (optional; defaults from server env)',
        required: false,
      },
      {
        name: 'waitForLoad',
        description: 'load | networkidle | domcontentloaded (default load)',
        required: false,
      },
      { name: 'timeout', description: 'Timeout in seconds (default 30)', required: false },
    ],
  },
  {
    name: 'audit-multiple-urls',
    description: 'Batch audit several pages (audit_multiple_urls).',
    arguments: [
      {
        name: 'urls',
        description: 'Comma-separated list of full URLs',
        required: true,
      },
      { name: 'parallel', description: 'Parallel runs (default 1)', required: false },
    ],
  },
  {
    name: 'authenticated-page-audit',
    description: 'Log in once, then audit a protected path (create_session + audit_with_session).',
    arguments: [
      { name: 'domain', description: 'Origin, e.g. https://app.example.com', required: true },
      { name: 'username', description: 'Login username', required: true },
      { name: 'password', description: 'Login password', required: true },
      {
        name: 'loginUrl',
        description: 'Login page URL if not {domain}/login',
        required: false,
      },
      {
        name: 'targetUrl',
        description: 'Full URL or path to audit after login',
        required: true,
      },
    ],
  },
  {
    name: 'explain-accessibility-rule',
    description: 'Educational explanation for one rule id (explain_issue).',
    arguments: [
      { name: 'ruleId', description: 'Rule id, e.g. image-alt', required: true },
      { name: 'context', description: 'Optional extra context', required: false },
    ],
  },
  {
    name: 'prioritize-and-quick-fixes',
    description:
      'Audit, prioritize backlog, then fetch actionable fixes (audit_url, prioritize_issues, get_quick_fixes).',
    arguments: [
      { name: 'url', description: 'Full URL to audit', required: true },
      {
        name: 'criteria',
        description: 'impact | wcag | fixability | user-impact (default impact)',
        required: false,
      },
      { name: 'limit', description: 'Max issues to prioritize (optional)', required: false },
      {
        name: 'fixesFormat',
        description: 'markdown | html | json for get_quick_fixes (default markdown)',
        required: false,
      },
    ],
  },
  {
    name: 'wcag-compliance-check',
    description: 'WCAG criterion breakdown for a URL (get_wcag_compliance; audits if URL passed).',
    arguments: [
      { name: 'url', description: 'Full URL', required: true },
      { name: 'level', description: 'A | AA | AAA (default AA)', required: false },
    ],
  },
  {
    name: 'official-compliance-report',
    description:
      'Audit then formal VPAT/WCAG/ADA/Section508 style report (audit_url + generate_compliance_report).',
    arguments: [
      { name: 'url', description: 'Full URL', required: true },
      {
        name: 'format',
        description: 'VPAT | WCAG | ADA | Section508 (default WCAG)',
        required: false,
      },
      { name: 'level', description: 'A | AA | AAA (default AA)', required: false },
      {
        name: 'includeRemediation',
        description: 'true | false (default false)',
        required: false,
      },
    ],
  },
  {
    name: 'compare-accessibility-versions',
    description: 'Before/after diff (compare_accessibility); each side may be URL or prior audit JSON.',
    arguments: [
      { name: 'before', description: 'URL or description of baseline', required: true },
      { name: 'after', description: 'URL or description of current', required: true },
      {
        name: 'outputFormat',
        description: 'summary | detailed | diff (default summary)',
        required: false,
      },
    ],
  },
  {
    name: 'track-accessibility-over-time',
    description: 'Historical trend view (track_accessibility).',
    arguments: [
      { name: 'url', description: 'Full URL to track', required: true },
      { name: 'timeframe', description: '7d | 30d | 90d | all (default 30d)', required: false },
      {
        name: 'metric',
        description: 'score | issues | wcag-compliance (default score)',
        required: false,
      },
    ],
  },
  {
    name: 'export-audit-deliverables',
    description:
      'One audit, then CSV, XLSX, JSON, and HTML exports (audit_url + export_to_* tools).',
    arguments: [
      { name: 'url', description: 'Full URL', required: true },
      {
        name: 'csvFormat',
        description: 'standard | detailed | minimal (default standard)',
        required: false,
      },
      {
        name: 'htmlTemplate',
        description: 'default | minimal | detailed (default default)',
        required: false,
      },
    ],
  },
  {
    name: 'filter-and-search-issues',
    description: 'Audit then slice and text-search issues (audit_url + filter_issues + search_issues).',
    arguments: [
      { name: 'url', description: 'Full URL', required: true },
      {
        name: 'filterMode',
        description: 'include | exclude (default include)',
        required: false,
      },
      {
        name: 'ruleIds',
        description: 'Comma-separated rule ids for filters.ruleIds (optional)',
        required: false,
      },
      { name: 'searchQuery', description: 'Query string for search_issues', required: true },
    ],
  },
  {
    name: 'aggregate-multiple-audits',
    description:
      'Batch audit URLs then merge stats (audit_multiple_urls + aggregate_audit_results + get_statistics).',
    arguments: [
      { name: 'urls', description: 'Comma-separated URLs', required: true },
      {
        name: 'groupBy',
        description: 'url | category | rule | none (default url)',
        required: false,
      },
    ],
  },
  {
    name: 'dashboard-and-executive-summary',
    description:
      'Audit once, then dashboard + exec summary (audit_url + generate_dashboard + generate_summary_report).',
    arguments: [
      { name: 'url', description: 'Full URL', required: true },
      {
        name: 'dashboardFormat',
        description: 'text | markdown | html | json (default markdown)',
        required: false,
      },
      {
        name: 'summaryLevel',
        description: 'executive | detailed | technical (default executive)',
        required: false,
      },
    ],
  },
  {
    name: 'score-accessibility',
    description: 'Numeric score and breakdown (get_accessibility_score; pass URL or audit object).',
    arguments: [
      { name: 'url', description: 'Full URL to score', required: true },
    ],
  },
  {
    name: 'full-accessibility-toolkit-runbook',
    description:
      'Checklist that walks through every MCP tool this server exposes, using one primary URL where applicable.',
    arguments: [
      { name: 'url', description: 'Primary full URL for audits and URL-accepting tools', required: true },
      {
        name: 'secondUrl',
        description: 'Optional second URL for compare_accessibility and multi-URL flows',
        required: false,
      },
    ],
  },
] as const

function promptResult(description: string, body: string): GetPromptResult {
  return {
    description,
    messages: [userMessage(body)],
  }
}

/**
 * Resolved prompt for `prompts/get`.
 */
export function getAccessibilityPrompt(
  name: string,
  args: PromptArgs | undefined
): GetPromptResult {
  const a = args ?? {}
  switch (name) {
    case 'audit-single-url': {
      const url = requireArg(a, 'url')
      const engine = optionalArg(a, 'engine', '')
      const waitForLoad = optionalArg(a, 'waitForLoad', 'load')
      const timeout = optionalArg(a, 'timeout', '30')
      const engineLine = engine
        ? `Use engine "${engine}" (must be axe or ace).`
        : 'Use default engine from server configuration unless the user specifies otherwise.'
      return promptResult(
        'Single URL audit',
        `You are using the Accessibility MCP server.

Call the tool **audit_url** with:
- url: ${url}
- waitForLoad: ${waitForLoad}
- timeout: ${Number(timeout) || 30}
${engineLine}

Summarize total issues, severity mix, and the top remediation themes. Do not invent violations beyond the tool output.`
      )
    }
    case 'audit-multiple-urls': {
      const urls = requireArg(a, 'urls')
      const parallel = optionalArg(a, 'parallel', '1')
      return promptResult(
        'Batch URL audits',
        `Call **audit_multiple_urls** with:
- urls: split the following comma-separated list into an array (or pass as comma-separated string per tool schema): ${urls}
- parallel: ${parallel}
- continueOnError: true unless the user wants fail-fast

Then summarize per-URL status, shared failure patterns, and worst pages.`
      )
    }
    case 'authenticated-page-audit': {
      const domain = requireArg(a, 'domain')
      const username = requireArg(a, 'username')
      requireArg(a, 'password')
      const loginUrl = optionalArg(a, 'loginUrl', '')
      const targetUrl = requireArg(a, 'targetUrl')
      const loginPart = loginUrl
        ? `loginUrl: ${loginUrl}`
        : 'Omit loginUrl to use default {domain}/login.'
      return promptResult(
        'Authenticated audit',
        `Use **create_session** with domain "${domain}", username "${username}", and password equal to the prompt argument \`password\` (required but never write the password in chat or logs). ${loginPart}

Then call **audit_with_session** with the returned sessionId and url "${targetUrl}" (if targetUrl is relative, set domain to "${domain}").

Report key violations on the protected page and any auth-specific risks (session expiry, etc.).`
      )
    }
    case 'explain-accessibility-rule': {
      const ruleId = requireArg(a, 'ruleId')
      const context = optionalArg(a, 'context', '')
      const ctxLine = context ? `Optional context from the user/site: ${context}` : ''
      return promptResult(
        'Explain one rule',
        `Call **explain_issue** with ruleId "${ruleId}". ${ctxLine}

Explain impact, WCAG linkage, and concrete fix patterns for developers.`
      )
    }
    case 'prioritize-and-quick-fixes': {
      const url = requireArg(a, 'url')
      const criteria = optionalArg(a, 'criteria', 'impact')
      const limit = optionalArg(a, 'limit', '')
      const fixesFormat = optionalArg(a, 'fixesFormat', 'markdown')
      const limitLine = limit ? `limit: ${limit}` : 'omit limit to return all prioritized issues'
      return promptResult(
        'Prioritize and fixes',
        `1) Call **audit_url** for ${url} and keep the AuditResult object.
2) Call **prioritize_issues** with results = that AuditResult, criteria "${criteria}", ${limitLine}.
3) Call **get_quick_fixes** with the same results, format "${fixesFormat}", includeCode true unless the user wants code omitted.

Present a ranked backlog and the most actionable fixes first.`
      )
    }
    case 'wcag-compliance-check': {
      const url = requireArg(a, 'url')
      const level = optionalArg(a, 'level', 'AA')
      return promptResult(
        'WCAG compliance',
        `Call **get_wcag_compliance** with results (URL string) "${url}" and level "${level}".

Summarize pass/fail/partial criteria, and which violations block conformance at that level.`
      )
    }
    case 'official-compliance-report': {
      const url = requireArg(a, 'url')
      const format = optionalArg(a, 'format', 'WCAG')
      const level = optionalArg(a, 'level', 'AA')
      const includeRemediation = optionalArg(a, 'includeRemediation', 'false')
      return promptResult(
        'Compliance report',
        `1) **audit_url** for ${url}.
2) **generate_compliance_report** with results = AuditResult from step 1, format "${format}", level "${level}", includeRemediation: ${includeRemediation === 'true'}.

Deliver an executive-ready summary plus where to find detail in the report structure.`
      )
    }
    case 'compare-accessibility-versions': {
      const before = requireArg(a, 'before')
      const after = requireArg(a, 'after')
      const outputFormat = optionalArg(a, 'outputFormat', 'summary')
      return promptResult(
        'Compare audits',
        `Call **compare_accessibility** with before and after set to URLs or audit payloads as the user indicated:
- before: ${before}
- after: ${after}
- format: ${outputFormat}

If the user gave descriptions instead of URLs, ask for URLs or prior audit JSON before calling the tool.

Highlight fixed vs regressed vs unchanged issues and score delta.`
      )
    }
    case 'track-accessibility-over-time': {
      const url = requireArg(a, 'url')
      const timeframe = optionalArg(a, 'timeframe', '30d')
      const metric = optionalArg(a, 'metric', 'score')
      return promptResult(
        'Trend tracking',
        `Call **track_accessibility** with url "${url}", timeframe "${timeframe}", metric "${metric}".

Explain the trend in plain language and limitations (e.g. sparse history).`
      )
    }
    case 'export-audit-deliverables': {
      const url = requireArg(a, 'url')
      const csvFormat = optionalArg(a, 'csvFormat', 'standard')
      const htmlTemplate = optionalArg(a, 'htmlTemplate', 'default')
      return promptResult(
        'Exports',
        `1) **audit_url** for ${url}.
2) With the same AuditResult as \`results\`, call:
   - **export_to_csv** (format ${csvFormat}, includeMetadata true unless user says otherwise)
   - **export_to_excel** (formatting true; charts only if user wants)
   - **export_to_json** (pretty true; includeRaw only if user needs engine payload)
   - **export_to_html_report** (template ${htmlTemplate})

Mention that supporting MCP clients may expose embedded download resources alongside JSON.`
      )
    }
    case 'filter-and-search-issues': {
      const url = requireArg(a, 'url')
      const filterMode = optionalArg(a, 'filterMode', 'include')
      const ruleIds = optionalArg(a, 'ruleIds', '')
      const searchQuery = requireArg(a, 'searchQuery')
      const filterLine = ruleIds
        ? `filters: { ruleIds: [${ruleIds.split(',').map((s) => `"${s.trim()}"`).join(', ')}] }, mode: "${filterMode}"`
        : `filters: choose at least one meaningful criterion (e.g. impactLevels or categories) with user confirmation; mode: "${filterMode}"`
      return promptResult(
        'Filter and search',
        `1) **audit_url** for ${url}.
2) **filter_issues** with results from step 1 and ${filterLine}
3) **search_issues** with results from step 1 (original audit), query "${searchQuery}", fields as needed.

Explain how filtering vs search changes the issue list.`
      )
    }
    case 'aggregate-multiple-audits': {
      const urls = requireArg(a, 'urls')
      const groupBy = optionalArg(a, 'groupBy', 'url')
      return promptResult(
        'Aggregate audits',
        `1) **audit_multiple_urls** for: ${urls}
2) **aggregate_audit_results** with the array of AuditResult objects, groupBy "${groupBy}", includeSummary true
3) **get_statistics** on the same array (or single combined view as appropriate)

Summarize hotspots across URLs/rules/categories.`
      )
    }
    case 'dashboard-and-executive-summary': {
      const url = requireArg(a, 'url')
      const dashboardFormat = optionalArg(a, 'dashboardFormat', 'markdown')
      const summaryLevel = optionalArg(a, 'summaryLevel', 'executive')
      return promptResult(
        'Dashboard and summary',
        `1) **audit_url** for ${url} and retain AuditResult.
2) **generate_dashboard** with results = AuditResult, format "${dashboardFormat}", includeCharts per user preference (default true).
3) **generate_summary_report** with the same results, level "${summaryLevel}", format markdown unless user wants html/text.

Produce a concise leadership narrative plus a link-style reference to dashboard sections.`
      )
    }
    case 'score-accessibility': {
      const url = requireArg(a, 'url')
      return promptResult(
        'Accessibility score',
        `Call **get_accessibility_score** with results (URL) "${url}". Optionally apply custom weights if the user provided them.

Interpret the score, breakdown, and what would move the needle most.`
      )
    }
    case 'full-accessibility-toolkit-runbook': {
      const url = requireArg(a, 'url')
      const secondUrl = optionalArg(a, 'secondUrl', '')
      const compareHint = secondUrl
        ? `Use **compare_accessibility** with before "${url}" and after "${secondUrl}" (or swap per user intent).`
        : `For **compare_accessibility**, obtain a second URL or second audit snapshot from the user.`
      return promptResult(
        'Full tool coverage',
        `Follow this runbook for "${url}" using this server's MCP tools only. Reuse the first **audit_url** AuditResult wherever a tool requires \`results\` as an object.

1) **audit_url** — baseline scan
2) **audit_multiple_urls** — only if the user has a list; otherwise skip with explanation
3) **create_session** / **audit_with_session** — only if the user needs authenticated coverage
4) **get_accessibility_score** — pass URL or saved AuditResult
5) **prioritize_issues** — on AuditResult
6) **explain_issue** — pick 2–3 representative ruleIds from the audit
7) **get_quick_fixes** — markdown or json per user
8) **compare_accessibility** — ${compareHint}
9) **track_accessibility** — if historical tracking is relevant
10) **generate_compliance_report** — VPAT/WCAG/ADA/Section508 per user
11) **get_wcag_compliance** — criterion view
12) **export_to_csv**, **export_to_excel**, **export_to_json**, **export_to_html_report** — as requested
13) **filter_issues** and **search_issues** — demonstrate slicing and search
14) **aggregate_audit_results** — if multiple AuditResult objects exist
15) **get_statistics** — distribution breakdowns
16) **generate_dashboard** and **generate_summary_report** — narrative + visuals

Skip steps that do not apply, but explicitly state which tools were skipped and why.`
      )
    }
    default:
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`)
  }
}

/**
 * Prompts returned from `prompts/list` (same entries as ACCESSIBILITY_PROMPT_LIST).
 */
export function listAccessibilityPrompts(): Prompt[] {
  return [...ACCESSIBILITY_PROMPT_LIST]
}
