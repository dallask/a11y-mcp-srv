# ♿ Accessibility MCP Server

A Model Context Protocol (MCP) server that provides conversational, actionable accessibility testing. This server exposes accessibility auditing tools that can be used by AI agents and chat interfaces.

## ✨ Features

- **Conversational Results**: Results formatted for natural language understanding, not raw data
- **Session Management**: Reusable authenticated sessions for testing protected pages
- **Tag Filtering**: Filter results by specific WCAG levels (wcag2a, wcag2aa, wcag21a, etc.)
- **Educational Focus**: Tools that explain issues in plain language with code examples
- **Code-Level Fixes**: Actual before/after code examples, not just descriptions
- **Progress Updates**: Streaming progress for long-running batch operations
- **Smart Prioritization**: AI-powered issue prioritization with quick wins identification
- **Compliance Reports**: Automated VPAT/WCAG/ADA compliance documentation
- **Trend Tracking**: Historical data and predictions for accessibility improvements

## 📋 Prerequisites

- **Node.js 18+** (for `npx` command)
- That's it! Everything else is handled automatically.

## 🚀 Quick Start (Using Published Package)

### Step 1: Add to Your MCP Client Configuration

Add this server to your MCP client configuration (e.g., Claude Desktop, Cursor):

#### Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "accessibility-audit": {
      "command": "npx",
      "args": ["-y", "@ali0113/accessibility-mcp-server"]
    }
  }
}
```

#### Cursor Configuration

Add to your Cursor MCP settings (`~/.cursor/mcp.json` or Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "accessibility-audit": {
      "command": "npx",
      "args": ["-y", "@ali0113/accessibility-mcp-server"]
    }
  }
}
```

### Step 2: Restart Your MCP Client

Restart Claude Desktop or Cursor to load the new MCP server configuration.

### Step 3: Start Using It!

That's it! You're ready to use all 25+ accessibility tools. The package will be automatically downloaded and cached by `npx` on first use.

**How it works:**
- `npx` automatically downloads and runs the package if needed
- The `-y` flag answers "yes" to prompts (non-interactive)
- Playwright browsers install automatically on first run
- No manual installation, building, or configuration needed!

## ⚙️ Configuration (Environment Variables)

You can configure the server via your MCP client’s `env` section (e.g. Cursor MCP settings or Claude Desktop config). These options follow the same style as [joe-watkins/accessibility-testing-mcp](https://github.com/joe-watkins/accessibility-testing-mcp).

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `A11Y_ENGINE` | `axe`, `ace` | `axe` | Testing engine: **axe-core** (Deque) or **IBM Equal Access** (ACE). |
| `WCAG_LEVEL` | `2.0_A`, `2.0_AA`, `2.0_AAA`, `2.1_A`, `2.1_AA`, `2.1_AAA`, `2.2_A`, `2.2_AA`, `2.2_AAA` | `2.1_AA` | WCAG version and level used when the tool does not specify tags. |
| `BEST_PRACTICES` | `true`, `false` | `true` | Include best-practice rules (adds `best-practice` tag when no tags are provided). |
| `SCREEN_SIZES` | Comma-separated `WIDTHxHEIGHT` | `1280x1024` | Viewport size(s) for the browser (e.g. `1280x1024,320x640`). The first size is used for audits. |
| `HEADLESS_BROWSER` | `true`, `false` | `true` | Run the browser in headless mode; set to `false` to show the browser window. |

### Example MCP config with env

**Cursor** (`~/.cursor/mcp.json` or Settings → MCP):

```json
{
  "mcpServers": {
    "accessibility-audit": {
      "command": "npx",
      "args": ["-y", "@ali0113/accessibility-mcp-server"],
      "env": {
        "A11Y_ENGINE": "axe",
        "WCAG_LEVEL": "2.2_AA",
        "BEST_PRACTICES": "true",
        "SCREEN_SIZES": "1280x1024,320x640",
        "HEADLESS_BROWSER": "true"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "accessibility-audit": {
      "command": "npx",
      "args": ["-y", "@ali0113/accessibility-mcp-server"],
      "env": {
        "A11Y_ENGINE": "axe",
        "WCAG_LEVEL": "2.2_AA",
        "BEST_PRACTICES": "true",
        "HEADLESS_BROWSER": "true"
      }
    }
  }
}
```

Tool parameters (e.g. `engine`, `tags`) override these defaults when provided in a request.

## 🎉 Awesome Things You Can Do

### 🔍 **Comprehensive Accessibility Auditing**
- **Audit any website** - Single URLs, multiple pages, or entire sites
- **Test protected pages** - Authenticated session management for login-protected content
- **Batch processing** - Test multiple URLs in parallel with progress tracking
- **WCAG compliance** - Check against WCAG 2.0, 2.1 (Levels A, AA, AAA) and best practices

### 🎯 **Smart Prioritization & Quick Wins**
- **Identify critical blockers** - Find must-fix issues that block users
- **Quick wins detection** - Easy fixes with high impact
- **Intelligent prioritization** - Sort by impact, WCAG level, fixability, or user impact
- **Focus your efforts** - Know exactly what to fix first

### 💻 **Code-Level Fixes**
- **Before/after code examples** - See exactly what needs to change
- **Copy-paste ready solutions** - Actual code, not just descriptions
- **Multiple formats** - Markdown, HTML, or JSON output
- **Specific fix suggestions** - Targeted solutions for each issue

### 📚 **Educational Resources**
- **Plain language explanations** - Understand what each issue means
- **Why it matters** - Learn the user impact
- **How to fix** - Step-by-step guidance with examples
- **WCAG references** - Direct links to accessibility standards
- **Common mistakes** - Learn from typical errors

### 📊 **Compliance & Reporting**
- **VPAT reports** - Generate Voluntary Product Accessibility Template documentation
- **WCAG compliance reports** - Detailed compliance breakdowns
- **ADA reports** - Americans with Disabilities Act compliance
- **Section 508 reports** - Federal accessibility compliance
- **Executive summaries** - High-level reports for stakeholders

### 📈 **Tracking & Comparison**
- **Before/after comparison** - Track improvements over time
- **Trend analysis** - Historical data and predictions
- **Score tracking** - Monitor accessibility scores
- **Visual diffs** - See what changed between audits

### 📤 **Export & Share**
- **CSV export** - Import into Excel for analysis
- **Excel export** - Professional reports with charts and formatting
- **JSON export** - For API integration and data processing
- **HTML reports** - Standalone web reports with visualizations
- **Dashboard generation** - Visual summaries with charts

### 🔎 **Filtering & Search**
- **Filter by criteria** - Rule IDs, categories, impact levels, WCAG levels
- **Search issues** - Find specific problems quickly
- **Include/exclude modes** - Focus on what matters
- **Element type filtering** - Find issues in specific HTML elements

### 📊 **Statistics & Aggregation**
- **Site-wide analysis** - Combine multiple audit results
- **Detailed statistics** - Breakdowns by category, impact, WCAG level
- **Aggregated summaries** - Overall site accessibility metrics
- **Grouping options** - Organize by URL, category, rule, or impact

### 🎨 **Visualization**
- **Dashboards** - Visual summaries with key metrics
- **Charts** - Score trends and category breakdowns
- **Multiple formats** - Text, Markdown, HTML, JSON
- **Executive reports** - High-level summaries for stakeholders

## 💡 Real-World Use Cases

### For Developers
- Get code-level fixes for accessibility issues
- Learn accessibility concepts with educational explanations
- Integrate into CI/CD pipelines
- Export results for team sharing

### For QA Teams
- Batch test multiple pages efficiently
- Track accessibility over time
- Generate compliance reports
- Compare before/after deployments

### For Product Managers
- Executive summary reports
- Compliance documentation (VPAT, ADA)
- Dashboard visualizations
- Track accessibility scores over time

### For Compliance Teams
- Generate VPAT reports automatically
- WCAG compliance documentation
- Section 508 compliance checks
- Detailed remediation plans

## 🎬 Quick Usage Example

Once configured, you can immediately start using the accessibility tools in your AI assistant:

**Example: Audit a website**
```
"Audit https://example.com for accessibility issues"
```

**Example: Get quick fixes**
```
"Show me quick fixes for the accessibility issues on cursor.com"
```

**Example: Generate compliance report**
```
"Generate a VPAT report for docs.atlan.com"
```

**Example: Compare before/after**
```
"Compare the accessibility of example.com before and after the redesign"
```

The AI assistant will automatically use the appropriate tools to fulfill your requests!

## 🛠️ Available Tools

### Tier 1: Core Audit Tools

#### `audit_url` - Single URL Audit

Test a single URL for accessibility issues with conversational, actionable results.

**Inputs:**
- `url` (required): Full URL or relative path
- `domain` (optional): Base domain if URL is relative
- `tags` (optional): Array of accessibility tags to check (e.g., `["wcag2a", "wcag2aa", "wcag21a", "best-practice"]`). If not provided, all tags are checked.
- `waitForLoad` (optional): Wait strategy - `"networkidle"` (default) | `"load"` | `"domcontentloaded"`
- `timeout` (optional): Timeout in seconds (default: 30)

**Example:**
```json
{
  "url": "https://example.com",
  "tags": ["wcag21aa"],
  "timeout": 45
}
```

**Output:** Structured JSON with summary, prioritized violations, WCAG compliance breakdown, quick fix suggestions, and conversational explanation.

#### `audit_multiple_urls` - Batch Audit

Test multiple URLs efficiently with progress updates.

**Inputs:**
- `urls` (required): Array of URLs or comma-separated string
- `domain` (optional): Base domain
- `tags` (optional): Array of accessibility tags
- `parallel` (optional): Number of parallel tests (default: 1)
- `continueOnError` (optional): Continue if one fails (default: true)

**Example:**
```json
{
  "urls": ["/home", "/about", "/contact"],
  "domain": "https://example.com",
  "tags": ["wcag2aa"],
  "parallel": 2
}
```

**Output:** Per-URL results, aggregated summary, and progress updates (streaming).

#### `audit_site` - Smart Site Audit

Intelligent site-wide audit with prioritization.

**Inputs:**
- `domain` (required): Base domain
- `tags` (optional): Array of accessibility tags. Applied to all pages.
- `strategy` (optional): `"critical"` | `"comprehensive"` | `"custom"` (default: `"comprehensive"`)
- `maxPages` (optional): Maximum pages to test (default: 50)
- `priorityPaths` (optional): Array of high-priority paths to test first

**Example:**
```json
{
  "domain": "https://example.com",
  "strategy": "critical",
  "priorityPaths": ["/", "/login", "/checkout"],
  "tags": ["wcag21aa"],
  "maxPages": 20
}
```

**Output:** Prioritized results (critical pages first), site-wide score, and trend analysis if previous audits exist.

### Tier 2: Session Management

#### `create_session` - Authenticated Session

Create a reusable authenticated session for testing protected pages.

**Inputs:**
- `domain` (required): Base domain
- `username` (required): Login username
- `password` (required): Login password
- `loginUrl` (optional): Custom login URL (default: `{domain}/login`)
- `loginSelectors` (optional): Custom selectors for login form:
  - `usernameSelector` (default: `"input[type='email'], input[name='username'], input[id='username']"`)
  - `passwordSelector` (default: `"input[type='password']"`)
  - `submitSelector` (default: `"button[type='submit'], input[type='submit']"`)
- `sessionId` (optional): Custom session identifier (auto-generated if not provided)

**Example:**
```json
{
  "domain": "https://app.example.com",
  "username": "user@example.com",
  "password": "password123",
  "loginUrl": "https://app.example.com/auth/login"
}
```

**Output:**
- `sessionId`: Reusable session identifier
- `expiresAt`: Session expiration time (ISO 8601)
- `testUrl`: Test URL to verify session

**Differentiator**: Only MCP with reusable session management for authenticated pages.

#### `audit_with_session` - Authenticated Audit

Run an audit using an existing authenticated session.

**Inputs:**
- `sessionId` (required): Session from `create_session`
- `url` (required): URL to test (can be relative)
- `domain` (optional): Base domain
- `tags` (optional): Array of accessibility tags
- `waitForLoad` (optional): Wait strategy (default: `"networkidle"`)
- `timeout` (optional): Timeout in seconds (default: 30)

**Example:**
```json
{
  "sessionId": "session-abc123",
  "url": "/dashboard",
  "domain": "https://app.example.com",
  "tags": ["wcag21aa"]
}
```

**Output:** Same as `audit_url` but for authenticated pages.

### Tier 3: Analysis & Reporting

#### `get_accessibility_score` - Calculate Score

Calculate accessibility score (0-100) with detailed breakdowns.

**Inputs:**
- `results` (required): Audit result object or URL string
- `weights` (optional): Custom weights for different issue types:
  - `errors` (default: 10)
  - `contrast` (default: 8)
  - `alerts` (default: 5)
  - `features` (default: 3)
  - `structural` (default: 6)

**Example:**
```json
{
  "results": "https://example.com",
  "weights": {
    "errors": 15,
    "contrast": 10
  }
}
```

**Output:**
- Overall score (0-100)
- Breakdown by category (contrast, navigation, forms, etc.)
- WCAG level compliance (A, AA, AAA)
- Trend if historical data available

#### `prioritize_issues` - Smart Prioritization

Intelligently prioritize issues, identifying quick wins and critical blockers.

**Inputs:**
- `results` (required): Audit result object
- `criteria` (optional): `"impact"` | `"wcag"` | `"fixability"` | `"user-impact"` (default: `"impact"`)
- `limit` (optional): Top N issues to return (default: 10)

**Example:**
```json
{
  "results": { /* audit result object */ },
  "criteria": "fixability",
  "limit": 5
}
```

**Output:**
- Prioritized list with reasoning
- Quick wins (easy fixes with high impact)
- Critical blockers

#### `explain_issue` - Educational Tool

Explain what an accessibility issue means in plain language.

**Inputs:**
- `ruleId` (required): Accessibility rule ID (e.g., `"alt_missing"`, `"contrast"`, `"label_missing"`)
- `context` (optional): Additional context about the issue (HTML element, page URL, etc.)

**Example:**
```json
{
  "ruleId": "alt_missing",
  "context": "Image on homepage hero section"
}
```

**Output:**
- Plain language explanation
- Why it matters (user impact)
- How to fix (with code examples)
- WCAG reference
- Common mistakes

**Differentiator**: Educational focus - helps users learn accessibility.

#### `get_quick_fixes` - Actionable Fixes

Get specific fix suggestions with before/after code examples.

**Inputs:**
- `results` (required): Audit result object or URL string
- `format` (optional): `"markdown"` | `"html"` | `"json"` (default: `"json"`)
- `includeCode` (optional): Include code examples (default: true)

**Example:**
```json
{
  "results": "https://example.com",
  "format": "markdown",
  "includeCode": true
}
```

**Output:**
- List of fixes with:
  - Current code (if available)
  - Fixed code
  - Explanation
  - Impact estimate

**Differentiator**: Code-level fixes, not just descriptions.

#### `generate_compliance_report` - Compliance Documentation

Generate compliance reports in various formats.

**Inputs:**
- `results` (required): Audit result object
- `format` (optional): `"VPAT"` | `"WCAG"` | `"ADA"` | `"Section508"` (default: `"WCAG"`)
- `level` (optional): `"A"` | `"AA"` | `"AAA"` (default: `"AA"`)
- `includeRemediation` (optional): Include fix suggestions (default: true)

**Example:**
```json
{
  "results": { /* audit result object */ },
  "format": "VPAT",
  "level": "AA",
  "includeRemediation": true
}
```

**Output:**
- Formatted compliance report
- WCAG mapping
- Remediation plan
- Executive summary

#### `get_wcag_compliance` - WCAG Status

Check WCAG compliance status with per-criterion breakdown.

**Inputs:**
- `results` (required): Audit result object or URL string
- `level` (optional): `"A"` | `"AA"` | `"AAA"` (default: `"AA"`)

**Example:**
```json
{
  "results": "https://example.com",
  "level": "AA"
}
```

**Output:**
- Compliance status (pass/fail/partial)
- Per-criterion breakdown
- Missing requirements
- Compliance percentage

### Tier 4: Comparison & Tracking

#### `compare_accessibility` - Before/After Comparison

Compare two audits to track improvements.

**Inputs:**
- `before` (required): Previous audit result or URL
- `after` (required): Current audit result or URL
- `format` (optional): `"summary"` | `"detailed"` | `"diff"` (default: `"summary"`)

**Example:**
```json
{
  "before": "https://example.com/v1",
  "after": "https://example.com/v2",
  "format": "detailed"
}
```

**Output:**
- Issues fixed
- Issues introduced
- Score improvement
- Remaining issues
- Visual diff (if applicable)

#### `track_accessibility` - Historical Tracking

Track accessibility over time with trend analysis.

**Inputs:**
- `url` (required): URL to track
- `timeframe` (optional): `"7d"` | `"30d"` | `"90d"` | `"all"` (default: `"30d"`)
- `metric` (optional): `"score"` | `"issues"` | `"wcag-compliance"` (default: `"score"`)

**Example:**
```json
{
  "url": "https://example.com",
  "timeframe": "90d",
  "metric": "score"
}
```

**Output:**
- Historical data
- Trend visualization (text-based)
- Predictions
- Recommendations

### Tier 5: Export & Data Management

#### `export_to_csv` - Export to CSV

Export audit results to CSV format for spreadsheet analysis, including metadata and violation rows.

**Inputs:**
- `results` (required): Audit result object or URL string
- `includeMetadata` (optional): Include test information and environment data (default: `true`)
- `includeViolations` (optional): Include detailed violation rows (default: `true`)
- `format` (optional): `"standard"` | `"detailed"` | `"minimal"` (default: `"standard"`)

**Example:**
```json
{
  "results": "https://example.com",
  "format": "detailed",
  "includeMetadata": true,
  "includeViolations": true
}
```

**Output:**
- CSV content as string with metadata section and violation rows
- Format type used
- Total issues count

**Use case**: Import into Excel, share with stakeholders, data analysis

#### `export_to_excel` - Export to Excel

Export audit results to Excel/XLSX format with formatting. Requires `xlsx` package.

**Inputs:**
- `results` (required): Audit result object or URL string
- `includeCharts` (optional): Generate charts for score trends and category breakdown (default: `false`)
- `formatting` (optional): Apply colors, headers, and styling (default: `true`)

**Example:**
```json
{
  "results": { /* audit result object */ },
  "includeCharts": true,
  "formatting": true
}
```

**Output:**
- Excel file content (base64 encoded)
- Format type (`xlsx`)
- Total issues count

**Use case**: Professional reports, presentations, stakeholder sharing

**Note**: Requires `xlsx` package. Install with `npm install xlsx`.

#### `export_to_json` - Export to JSON

Export audit results as structured JSON with optional raw results.

**Inputs:**
- `results` (required): Audit result object or URL string
- `pretty` (optional): Pretty-print JSON (default: `true`)
- `includeRaw` (optional): Include raw accessibility engine results (default: `false`)

**Example:**
```json
{
  "results": "https://example.com",
  "pretty": true,
  "includeRaw": false
}
```

**Output:**
- JSON string with audit results
- Pretty-print status
- Raw results inclusion status

**Use case**: API integration, data processing, backup

#### `export_to_html_report` - Generate HTML Report

Generate standalone HTML report with styling and optional visual charts.

**Inputs:**
- `results` (required): Audit result object or URL string
- `template` (optional): `"default"` | `"minimal"` | `"detailed"` (default: `"default"`)
- `includeCharts` (optional): Include visual charts (default: `true`)

**Example:**
```json
{
  "results": "https://example.com",
  "template": "detailed",
  "includeCharts": true
}
```

**Output:**
- HTML string with embedded CSS/JS
- Template used
- Charts inclusion status

**Use case**: Web sharing, email reports, documentation

### Tier 6: Filtering & Search

#### `filter_issues` - Filter Issues

Filter issues from audit results by various criteria (rule IDs, categories, impact levels, WCAG levels, etc.). Supports include/exclude modes.

**Inputs:**
- `results` (required): Audit result object
- `filters` (required): Object with filter criteria:
  - `ruleIds` (optional): Array of rule IDs to include/exclude
  - `categories` (optional): Array of categories (error, contrast, etc.)
  - `impactLevels` (optional): Array of impact levels (`"critical"`, `"serious"`, `"moderate"`, `"minor"`)
  - `wcagLevels` (optional): Array of WCAG levels (`"A"`, `"AA"`, `"AAA"`)
  - `minCount` (optional): Minimum occurrence count
  - `elementTypes` (optional): Filter by HTML element types (e.g., `["img", "input", "button"]`)
- `mode` (optional): `"include"` | `"exclude"` (default: `"include"`)

**Example:**
```json
{
  "results": { /* audit result object */ },
  "filters": {
    "impactLevels": ["critical", "serious"],
    "wcagLevels": ["A", "AA"]
  },
  "mode": "include"
}
```

**Output:**
- Filtered audit result object
- Original issue count
- Filtered issue count
- Filters applied

**Use case**: Focus on specific issue types, exclude false positives

#### `search_issues` - Search Issues

Search issues by text content, selector, XPath, or description. Supports case-sensitive and case-insensitive search.

**Inputs:**
- `results` (required): Audit result object
- `query` (required): Search query string
- `fields` (optional): Array of fields to search (`"description"`, `"element"`, `"xpath"`, `"selector"`, `"ruleId"`, `"userImpact"`, `"fix"`, `"all"`) (default: `["all"]`)
- `caseSensitive` (optional): Case-sensitive search (default: `false`)

**Example:**
```json
{
  "results": { /* audit result object */ },
  "query": "missing alt",
  "fields": ["description", "userImpact"],
  "caseSensitive": false
}
```

**Output:**
- Array of matching issues
- Total matches count
- Fields searched

**Use case**: Find specific issues, locate elements

### Tier 7: Aggregation & Statistics

#### `aggregate_audit_results` - Aggregate Results

Combine and aggregate multiple audit results. Groups issues by URL, category, rule, or none, and provides aggregated summary statistics.

**Inputs:**
- `results` (required): Array of audit result objects
- `groupBy` (optional): `"url"` | `"category"` | `"rule"` | `"none"` (default: `"url"`)
- `includeSummary` (optional): Include aggregated summary statistics (default: `true`)

**Example:**
```json
{
  "results": [
    { /* audit result 1 */ },
    { /* audit result 2 */ }
  ],
  "groupBy": "category",
  "includeSummary": true
}
```

**Output:**
- Aggregated audit result with combined statistics
- Grouping strategy used
- Total results aggregated
- Grouped issues (if applicable)

**Use case**: Site-wide reports, batch analysis, trend identification

#### `get_statistics` - Generate Statistics

Generate detailed statistics from audit results with breakdowns by category, impact, WCAG level, or rule ID. Supports single or multiple audit results.

**Inputs:**
- `results` (required): Audit result object or array of audit results
- `breakdown` (optional): Array of breakdown dimensions (`"category"`, `"impact"`, `"wcag"`, `"rule"`) (default: all dimensions)

**Example:**
```json
{
  "results": [
    { /* audit result 1 */ },
    { /* audit result 2 */ }
  ],
  "breakdown": ["category", "impact", "wcag"]
}
```

**Output:**
- Total issues count
- Average accessibility score
- WCAG compliance breakdown
- Statistics by category, impact, WCAG level, and rule ID
- Counts, percentages, and distributions

**Use case**: Dashboard data, reporting, analysis

### Tier 8: Visualization & Reporting

#### `generate_dashboard` - Generate Dashboard

Create a visual dashboard summary of audit results with key metrics, charts, and summaries. Supports multiple formats and optional charts.

**Inputs:**
- `results` (required): Audit result object, array of audit results, URL string, or array of URL strings
- `format` (optional): `"text"` | `"markdown"` | `"html"` | `"json"` (default: `"markdown"`)
- `includeCharts` (optional): Include ASCII/text charts (default: `true`)

**Example:**
```json
{
  "results": ["https://example.com/page1", "https://example.com/page2"],
  "format": "markdown",
  "includeCharts": true
}
```

**Output:**
- Formatted dashboard with key metrics, charts, and summaries
- Format used
- Total results processed

**Use case**: Quick overview, presentations, status reports

#### `generate_summary_report` - Generate Summary Report

Generate executive summary report with key findings and recommendations. Supports multiple formats and detail levels.

**Inputs:**
- `results` (required): Audit result object, array of audit results, URL string, or array of URL strings
- `format` (optional): `"text"` | `"markdown"` | `"html"` (default: `"markdown"`)
- `level` (optional): `"executive"` | `"detailed"` | `"technical"` (default: `"executive"`)

**Example:**
```json
{
  "results": "https://example.com",
  "format": "markdown",
  "level": "executive"
}
```

**Output:**
- Summary report with key findings and recommendations
- Format used
- Detail level used
- Total results processed

**Use case**: Stakeholder communication, documentation

## 🏷️ Supported Accessibility Tags

Filter results by specific WCAG levels or best practices:

- `wcag2a` - WCAG 2.0 Level A
- `wcag2aa` - WCAG 2.0 Level AA
- `wcag2aaa` - WCAG 2.0 Level AAA
- `wcag21a` - WCAG 2.1 Level A
- `wcag21aa` - WCAG 2.1 Level AA (most common requirement)
- `wcag21aaa` - WCAG 2.1 Level AAA
- `best-practice` - Best practice recommendations

**Example Usage:**
```json
// Only check WCAG 2.1 AA compliance
{
  "url": "https://example.com",
  "tags": ["wcag21aa"]
}

// Check multiple WCAG levels
{
  "url": "https://example.com",
  "tags": ["wcag2a", "wcag2aa", "best-practice"]
}
```

## 📊 Result Format

All audit tools return structured results in the following format:

```typescript
{
  summary: {
    totalIssues: number
    score: number
    wcagCompliance: { A: number, AA: number, AAA: number }
    byCategory: Record<string, number>
    byImpact: Record<string, number>
  }
  prioritizedIssues: Array<{
    ruleId: string
    impact: 'critical' | 'serious' | 'moderate' | 'minor'
    description: string
    wcagLevel: string
    tags: string[] // Array of tags this violation matches
    element: string
    xpath: string
    fix: {
      current: string
      suggested: string
      explanation: string
    }
    userImpact: string
    priority: number
  }>
  conversationalSummary: string
  quickWins: Array<{
    ruleId: string
    description: string
    impact: string
    fix: string
  }>
  criticalBlockers: Array<{
    ruleId: string
    description: string
    impact: string
  }>
  appliedFilters?: {
    tags?: string[]
    originalIssueCount?: number
  }
}
```

## 📝 Usage Examples

### Basic URL Audit

```json
{
  "tool": "audit_url",
  "arguments": {
    "url": "https://example.com",
    "tags": ["wcag21aa"]
  }
}
```

### Authenticated Audit Flow

**Step 1: Create Session**
```json
{
  "tool": "create_session",
  "arguments": {
    "domain": "https://app.example.com",
    "username": "user@example.com",
    "password": "password123"
  }
}
```

**Step 2: Audit Protected Page**
```json
{
  "tool": "audit_with_session",
  "arguments": {
    "sessionId": "<session-id-from-step-1>",
    "url": "/dashboard",
    "tags": ["wcag21aa"]
  }
}
```

### Batch Audit with Progress

```json
{
  "tool": "audit_multiple_urls",
  "arguments": {
    "urls": ["/home", "/about", "/contact", "/products"],
    "domain": "https://example.com",
    "parallel": 2,
    "tags": ["wcag2aa"]
  }
}
```

### Get Quick Fixes

```json
{
  "tool": "get_quick_fixes",
  "arguments": {
    "results": "https://example.com",
    "format": "markdown",
    "includeCode": true
  }
}
```

### Compare Before/After

```json
{
  "tool": "compare_accessibility",
  "arguments": {
    "before": "https://example.com/v1",
    "after": "https://example.com/v2",
    "format": "detailed"
  }
}
```

### Generate Compliance Report

```json
{
  "tool": "generate_compliance_report",
  "arguments": {
    "results": { /* audit result object */ },
    "format": "VPAT",
    "level": "AA",
    "includeRemediation": true
  }
}
```

### Export to CSV

```json
{
  "tool": "export_to_csv",
  "arguments": {
    "results": "https://example.com",
    "format": "detailed",
    "includeMetadata": true,
    "includeViolations": true
  }
}
```

### Export to Excel

```json
{
  "tool": "export_to_excel",
  "arguments": {
    "results": { /* audit result object */ },
    "includeCharts": true,
    "formatting": true
  }
}
```

### Export to JSON

```json
{
  "tool": "export_to_json",
  "arguments": {
    "results": "https://example.com",
    "pretty": true,
    "includeRaw": false
  }
}
```

### Generate HTML Report

```json
{
  "tool": "export_to_html_report",
  "arguments": {
    "results": "https://example.com",
    "template": "detailed",
    "includeCharts": true
  }
}
```

### Filter Issues

```json
{
  "tool": "filter_issues",
  "arguments": {
    "results": { /* audit result object */ },
    "filters": {
      "impactLevels": ["critical", "serious"],
      "wcagLevels": ["A", "AA"]
    },
    "mode": "include"
  }
}
```

### Search Issues

```json
{
  "tool": "search_issues",
  "arguments": {
    "results": { /* audit result object */ },
    "query": "missing alt",
    "fields": ["description", "userImpact"],
    "caseSensitive": false
  }
}
```

### Aggregate Audit Results

```json
{
  "tool": "aggregate_audit_results",
  "arguments": {
    "results": [
      { /* audit result 1 */ },
      { /* audit result 2 */ }
    ],
    "groupBy": "category",
    "includeSummary": true
  }
}
```

### Get Statistics

```json
{
  "tool": "get_statistics",
  "arguments": {
    "results": [
      { /* audit result 1 */ },
      { /* audit result 2 */ }
    ],
    "breakdown": ["category", "impact", "wcag"]
  }
}
```

### Generate Dashboard

```json
{
  "tool": "generate_dashboard",
  "arguments": {
    "results": ["https://example.com/page1", "https://example.com/page2"],
    "format": "markdown",
    "includeCharts": true
  }
}
```

### Generate Summary Report

```json
{
  "tool": "generate_summary_report",
  "arguments": {
    "results": "https://example.com",
    "format": "markdown",
    "level": "executive"
  }
}
```

## 🐛 Error Handling

The server includes comprehensive error handling:

- **Graceful degradation**: Partial results on batch failures
- **Clear error messages**: Human-readable error descriptions
- **Retry logic**: Automatic retries for transient failures
- **Validation**: Input validation with helpful error messages

Common error scenarios:
- Invalid URLs or unreachable pages
- Session expiration (for authenticated audits)
- Timeout errors (configurable)
- Invalid tag combinations

## 🏗️ Project Structure

```
accessibility-mcp-server/
├── src/
│   ├── server.ts           # Main MCP server entry point
│   ├── tools/              # Tool implementations
│   │   ├── audit.ts       # Core audit tools
│   │   ├── session.ts     # Session management
│   │   ├── analysis.ts    # Analysis & reporting
│   │   ├── comparison.ts  # Comparison tools
│   │   ├── export.ts      # Export tools (CSV, Excel, JSON, HTML)
│   │   ├── filter.ts      # Filtering and search tools
│   │   ├── aggregate.ts   # Aggregation and statistics tools
│   │   └── visualize.ts   # Visualization and dashboard tools
│   ├── core/              # Core accessibility functionality
│   │   ├── accessibility-runner.ts      # Accessibility execution
│   │   ├── session-manager.ts  # Session handling
│   │   ├── result-processor.ts # Result formatting
│   │   ├── error-handler.ts    # Error handling
│   │   └── progress-streamer.ts # Progress updates
│   └── types/             # TypeScript types
├── dist/                  # Compiled JavaScript
├── wave.min.js           # Accessibility engine script (required)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔨 Local Development (Optional)

If you want to contribute or modify the code, you can set up a local development environment:

### Prerequisites for Local Development

- Node.js 18+
- npm or yarn

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd accessibility-mcp-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Playwright browsers**
   ```bash
   npx playwright install --with-deps chromium
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Verify accessibility script**
   - Ensure `wave.min.js` is present in the project root

### Running Locally

**Development Mode (with watch)**
```bash
npm run dev
```

**Production Mode**
```bash
npm start
```

### Using Local Version in MCP Client

If you want to use the local version instead of the published package:

```json
{
  "mcpServers": {
    "accessibility-audit": {
      "command": "node",
      "args": ["/absolute/path/to/accessibility-mcp-server/dist/server.js"]
    }
  }
}
```

**Note**: Use absolute paths in your configuration.

## 🔑 Key Differentiators

1. **Zero Setup Required** - Just add config and use! No installation, building, or manual setup needed
2. **Conversational Interface** - Results formatted for natural language understanding
3. **Session Management** - Only MCP with reusable authenticated sessions for protected pages
4. **Educational Focus** - `explain_issue` teaches accessibility concepts, not just reports problems
5. **Code-Level Fixes** - Actual before/after code examples, not just descriptions
6. **Progress Updates** - Streaming progress for long-running batch operations
7. **Smart Prioritization** - AI-powered issue prioritization with quick wins identification
8. **Compliance Reports** - Automated VPAT/WCAG/ADA/Section 508 documentation
9. **Tag Filtering** - Filter by specific WCAG levels to reduce noise and focus on what matters
10. **25+ Tools** - Comprehensive suite covering auditing, analysis, reporting, export, and more

## 📄 License

MIT License - feel free to use in your projects!

## 🤝 Contributing

Contributions are welcome! Please ensure all code follows the existing style and includes appropriate tests.

## 🆘 Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Happy accessibility testing! ♿✨**
