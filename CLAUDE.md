# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commonly Used Commands

*   **Build**: `npm run build` — compiles TypeScript to `dist/`
*   **Dev server**: `npm run dev` — runs via `tsx` in watch mode
*   **Tests (watch)**: `npm test`
*   **Tests (single run)**: `npm run test:run`
*   **Single test file**: `npx vitest tests/unit/audit.test.ts`
*   **E2E tests**: `npm run test:e2e` — builds first, then runs E2E suite
*   **Coverage**: `npm run test:coverage`

No linter is configured; code quality is enforced through strict TypeScript (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`).

## Tech Stack

*   **Runtime**: Node.js 18+, ESM (`"type": "module"`)
*   **Language**: TypeScript 5, strict mode
*   **MCP SDK**: `@modelcontextprotocol/sdk` (Server, StdioServerTransport)
*   **Accessibility engines**: axe-core and IBM accessibility-checker (ACE), configurable via `A11Y_ENGINE` env var (default: `ace`)
*   **Browser**: Playwright (headless by default)
*   **Testing**: Vitest with `@vitest/coverage-v8`; path alias `@/` → `src/`
*   **Release**: semantic-release on `release/*` branches with conventional commits

## Architecture

This is an MCP server exposing 22 accessibility auditing tools to AI agents over stdio.

### Data flow

1. **`src/server.ts`** — Entrypoint. Registers all tools via `ListToolsRequestSchema` (tool name + JSON schema) and routes calls via `CallToolRequestSchema` (switch on `request.params.name`). Every handler returns `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`.

2. **`src/tools/`** — Domain-grouped tool handlers:
   - `audit.ts` — `audit_url`, `audit_multiple_urls`
   - `session.ts` — `create_session`, `audit_with_session` (authenticated pages)
   - `analysis.ts` — `get_accessibility_score`, `prioritize_issues`, `explain_issue`, `get_quick_fixes`, `generate_compliance_report`, `get_wcag_compliance`
   - `comparison.ts` — `compare_accessibility`, `track_accessibility`
   - `export.ts` — `export_to_csv`, `export_to_excel`, `export_to_json`, `export_to_html_report`
   - `filter.ts` — `filter_issues`, `search_issues`
   - `aggregate.ts` — `aggregate_audit_results`, `get_statistics`
   - `visualize.ts` — `generate_dashboard`, `generate_summary_report`

3. **`src/core/`** — Shared infrastructure:
   - `normalize-audit-result.ts` — **Critical**: `resolveAuditInput()` normalizes raw engine output (JSON strings, MCP wrappers, batch results, ACE/axe shapes) into the canonical `AuditResult`. All downstream tools depend on this.
   - `accessibility-runner.ts` — Interfaces with axe-core and IBM ACE engines
   - `playwright-bootstrap.ts` — Manages headless browser instances
   - `config.ts` — Environment variable parsing (`A11Y_ENGINE`, `WCAG_LEVEL`, `BEST_PRACTICES`, `SCREEN_SIZES`, `HEADLESS_BROWSER`)
   - `error-handler.ts` — `handleErrorGracefully`, `retryWithBackoff`, `formatErrorMessage`
   - `session-manager.ts` — Authenticated session lifecycle
   - `progress-streamer.ts` — Batch operation progress reporting

4. **`src/types/index.ts`** — All TypeScript interfaces: `AuditResult` (canonical shape with `summary`, `prioritizedIssues`, `quickWins`, `criticalBlockers`, `conversationalSummary`), tool I/O types, `WCAGCompliance`, `ImpactLevel`, etc.

### Adding a new tool

1. Define input/output interfaces in `src/types/index.ts`
2. Implement handler as an async function in `src/tools/<domain>.ts`
3. Register schema in `src/server.ts` inside `ListToolsRequestSchema` handler
4. Route the call in `src/server.ts` inside `CallToolRequestSchema` switch
5. Add tests in `tests/unit/` (mirror `src/` structure)

## Code Conventions

*   **Naming**: PascalCase for classes, camelCase for functions/variables, kebab-case for files, UPPERCASE for constants/env vars
*   **Imports**: ESM with `.js` extensions in relative imports (e.g., `from './tools/audit.js'`); use `import type` for type-only imports
*   **Error handling**: Use `handleErrorGracefully` / `formatErrorMessage` from `src/core/error-handler.ts`; never return `[object Object]`
*   **No `any`**: Use strong typing; prefer types from `src/types/index.ts`
*   **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`) — semantic-release drives versioning and changelogs

## Testing Patterns

*   **Unit** (`tests/unit/`): Mirror `src/` structure. Use fixtures from `tests/fixtures/` (e.g., `audit-result.json`) and helpers from `tests/helpers/` (e.g., `mock-audit.ts`)
*   **Integration** (`tests/integration/`): Mock transport, send JSON-RPC calls (tools/list, tools/call), assert on responses
*   **E2E** (`tests/e2e/`): Spawn real `dist/server.js` via MCP Client + `StdioClientTransport`; requires build first; use extended timeouts (e.g., `20_000 ms`)
*   **Assertions**: For MCP responses, parse JSON from `content[0].text` and assert on parsed result and `isError`

## Environment Variables

Configured via MCP client `env` section:

| Variable | Default | Description |
|---|---|---|
| `A11Y_ENGINE` | `ace` | `axe` or `ace` |
| `WCAG_LEVEL` | `2.2_AA` | e.g., `2.0_A`, `2.1_AA`, `2.2_AAA` |
| `BEST_PRACTICES` | `true` | Include best-practice rules |
| `SCREEN_SIZES` | `1280x1024` | Comma-separated `WIDTHxHEIGHT` |
| `HEADLESS_BROWSER` | `true` | Set `false` to show browser window |
