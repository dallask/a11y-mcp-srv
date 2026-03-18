# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commonly Used Commands

*   **Build the project**: `npm run build`
    Compiles the TypeScript code into JavaScript in the `dist/` directory.
*   **Run Development Server**: `npm run dev`
    Runs the MCP server using `tsx` in watch mode, automatically restarting on file changes.
*   **Run All Tests (Watch Mode)**: `npm test`
    Starts the Vitest test runner.
*   **Run All Tests (Single Run)**: `npm run test:run`
    Executes Vitest tests without watch mode (useful for CI).
*   **Run a Single Test**: `npx vitest path/to/test.ts`
    Runs a specific test file. For example: `npx vitest tests/unit/audit.test.ts`
*   **Run E2E Tests**: `npm run test:e2e`
    Builds the project and executes End-to-End tests located in `tests/e2e`.
*   **Generate Test Coverage**: `npm run test:coverage`
    Runs Vitest with coverage reporting powered by v8.

## High-Level Code Architecture

The `accessibility-mcp-server` is a Model Context Protocol (MCP) server providing accessibility auditing tools for AI agents.

### Key Components:

*   **Server Entrypoint (`src/server.ts`)**:
    Configures and initializes the MCP server using `@modelcontextprotocol/sdk`. It implements the StdioServerTransport and registers all available tools and schemas.
*   **Tool Handlers (`src/tools/`)**:
    The logic for exposed MCP tools is modularized by domain. For example:
    *   `audit.ts`: Single and batch URL accessibility auditing.
    *   `analysis.ts`: Issue explanation, quick fixes, prioritization, and scoring.
    *   `export.ts` / `visualize.ts`: Formats results into JSON, CSV, Excel, HTML, or dashboard reports.
    *   `session.js`: Reusable authenticated sessions for testing protected pages.
*   **Core Utilities (`src/core/`)**:
    Shared infrastructure supporting the tools, such as the `error-handler.ts` for consistent error surface formatting, and `progress-streamer.ts` for reporting batch operations.
*   **Type Definitions (`src/types/`)**:
    Holds TypeScript interfaces mapping to MCP tool inputs and outputs.
*   **Testing Structure (`tests/`)**:
    Testing is handled via Vitest and segregated by type: `unit/`, `integration/`, and `e2e/`. Reusable mock data and testing helpers are stored in `fixtures/` and `helpers/`.
