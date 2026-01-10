# 🌊 WAVE Accessibility MCP Server

A Model Context Protocol (MCP) server that provides conversational, actionable accessibility testing powered by the WAVE accessibility engine. This server exposes accessibility auditing tools that can be used by AI agents and chat interfaces.

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

- Node.js 18+ 
- Playwright browsers (installed automatically)

## 🚀 Installation & Setup

### Step 1: Install Dependencies

```bash
cd mcp-server
npm install
```

### Step 2: Install Playwright Browsers

```bash
npx playwright install --with-deps chromium
```

### Step 3: Build the Project

```bash
npm run build
```

### Step 4: Verify wave.min.js

The `wave.min.js` file should be present in the `mcp-server` directory. This file contains the WAVE accessibility engine and is required for all audits. If it's missing, copy it from the project root:

```bash
cp ../wave.min.js ./wave.min.js
```

## 🔧 Running the MCP Server

### Development Mode (with watch)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

## ⚙️ MCP Client Configuration

Add this server to your MCP client configuration (e.g., Claude Desktop, Cursor):

### Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "wave-accessibility-audit": {
      "command": "node",
      "args": ["/absolute/path/to/wave-accessibility-audit/mcp-server/dist/server.js"]
    }
  }
}
```

### Cursor Configuration

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "wave-accessibility-audit": {
      "command": "node",
      "args": ["/absolute/path/to/wave-accessibility-audit/mcp-server/dist/server.js"]
    }
  }
}
```

**Note**: Use absolute paths in your configuration. Replace `/absolute/path/to/` with the actual path to your project.

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
- `ruleId` (required): WAVE rule ID (e.g., `"alt_missing"`, `"contrast"`, `"label_missing"`)
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
mcp-server/
├── src/
│   ├── server.ts           # Main MCP server entry point
│   ├── tools/              # Tool implementations
│   │   ├── audit.ts       # Core audit tools
│   │   ├── session.ts     # Session management
│   │   ├── analysis.ts    # Analysis & reporting
│   │   └── comparison.ts  # Comparison tools
│   ├── core/              # Core WAVE functionality
│   │   ├── wave-runner.ts      # WAVE execution
│   │   ├── session-manager.ts  # Session handling
│   │   ├── result-processor.ts # Result formatting
│   │   ├── error-handler.ts    # Error handling
│   │   └── progress-streamer.ts # Progress updates
│   └── types/             # TypeScript types
├── dist/                  # Compiled JavaScript
├── wave.min.js           # WAVE accessibility engine (required)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔨 Development

### Building

```bash
npm run build
```

### Development Mode (with watch)

```bash
npm run dev
```

### TypeScript Configuration

The project uses TypeScript with ES modules. See `tsconfig.json` for configuration details.

## 🔑 Key Differentiators

1. **Conversational Interface**: Results formatted for natural language understanding
2. **Session Management**: Only MCP with reusable authenticated sessions
3. **Educational**: `explain_issue` teaches accessibility concepts
4. **Code-Level Fixes**: Actual code examples, not just descriptions
5. **Progress Updates**: Streaming progress for long operations
6. **Smart Prioritization**: AI-powered issue prioritization
7. **Compliance Reports**: Automated VPAT/WCAG documentation
8. **Tag Filtering**: Filter by specific WCAG levels to reduce noise

## 📄 License

MIT License - feel free to use in your projects!

## 🤝 Contributing

Contributions are welcome! Please ensure all code follows the existing style and includes appropriate tests.

## 🆘 Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Happy accessibility testing! 🌊✨**
