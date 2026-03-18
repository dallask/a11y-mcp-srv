/**
 * E2E tests: real MCP server process over stdio.
 * Uses @modelcontextprotocol/sdk Client + StdioClientTransport to spawn the server
 * and exercise tools/list and tools/call over JSON-RPC.
 *
 * Prerequisite: npm run build (server runs from dist/server.js).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = join(__dirname, '../..')
const serverPath = join(projectRoot, 'dist/server.js')
const auditResultFixture = JSON.parse(
  readFileSync(join(projectRoot, 'tests/fixtures/audit-result.json'), 'utf-8')
)

describe(
  'E2E: MCP server over stdio',
  { timeout: 20_000 },
  () => {
    let client: Client
    let transport: StdioClientTransport

    beforeAll(async () => {
      if (!existsSync(serverPath)) {
        throw new Error(
          `E2E requires built server at ${serverPath}. Run: npm run build`
        )
      }
      transport = new StdioClientTransport({
        command: process.execPath,
        args: [serverPath],
        env: { ...process.env, NODE_ENV: 'test' },
      })
      client = new Client(
        { name: 'e2e-test-client', version: '1.0.0' },
        { capabilities: {} }
      )
      transport.onerror = (err) => {
        console.error('[E2E transport error]', err)
      }
      await client.connect(transport)
    }, 15_000)

    afterAll(async () => {
      await client.close()
    })

    it('lists tools and returns 22 tools with expected names', async () => {
      const result = await client.listTools()
      expect(result.tools).toBeDefined()
      expect(result.tools!.length).toBe(22)
      const names = result.tools!.map((t) => t.name)
      expect(names).toContain('audit_url')
      expect(names).toContain('audit_multiple_urls')
      expect(names).toContain('filter_issues')
      expect(names).toContain('explain_issue')
      expect(names).toContain('generate_dashboard')
      expect(names).toContain('generate_summary_report')
      result.tools!.forEach((t) => {
        expect(t.name).toBeDefined()
        expect(t.description).toBeDefined()
        expect(t.inputSchema).toBeDefined()
      })
    })

    it('calls filter_issues and returns filtered result', async () => {
      const result = await client.callTool({
        name: 'filter_issues',
        arguments: {
          results: auditResultFixture,
          filters: { ruleIds: ['image-alt'] },
          mode: 'include',
        },
      })
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
      expect((result.content as unknown[]).length).toBeGreaterThan(0)
      const text = result.content![0].type === 'text' ? result.content![0].text : undefined
      expect(text).toBeDefined()
      const parsed = JSON.parse(text!)
      expect(parsed.filtered).toBeDefined()
      expect(parsed.filteredCount).toBe(1)
      expect(result.isError).toBeFalsy()
    })

    it('calls explain_issue and returns explanation', async () => {
      const result = await client.callTool({
        name: 'explain_issue',
        arguments: { ruleId: 'image-alt' },
      })
      expect(result.content).toBeDefined()
      const text = result.content![0].type === 'text' ? result.content![0].text : undefined
      expect(text).toBeDefined()
      const parsed = JSON.parse(text!)
      expect(parsed.ruleId).toBe('image-alt')
      expect(parsed.explanation).toBeDefined()
      expect(result.isError).toBeFalsy()
    })

    it('calls generate_dashboard with fixture and returns markdown', async () => {
      const result = await client.callTool({
        name: 'generate_dashboard',
        arguments: {
          results: auditResultFixture,
          format: 'markdown',
          includeCharts: true,
        },
      })
      expect(result.content).toBeDefined()
      const text = result.content![0].type === 'text' ? result.content![0].text : undefined
      expect(text).toBeDefined()
      const parsed = JSON.parse(text!)
      expect(parsed.dashboard).toBeDefined()
      expect(typeof parsed.dashboard).toBe('string')
      expect(parsed.dashboard).toMatch(/accessibility|Accessibility|dashboard|score/i)
      expect(parsed.format).toBe('markdown')
      expect(result.isError).toBeFalsy()
    })

    it('calls unknown tool and returns isError with message', async () => {
      const result = await client.callTool({
        name: 'unknown_tool_xyz',
        arguments: {},
      })
      expect(result.content).toBeDefined()
      const text = result.content![0].type === 'text' ? result.content![0].text : undefined
      expect(text).toBeDefined()
      const parsed = JSON.parse(text!)
      expect(parsed.error).toBeDefined()
      expect(typeof parsed.error).toBe('string')
      expect(parsed.error).not.toBe('[object Object]')
      expect(result.isError).toBe(true)
    })
  }
)
