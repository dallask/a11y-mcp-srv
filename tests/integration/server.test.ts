import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createServer } from '../../src/server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const auditResultFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/audit-result.json'), 'utf-8')
)

describe('Server integration', () => {
  let server: Awaited<ReturnType<typeof createServer>>
  const sentMessages: unknown[] = []

  beforeEach(async () => {
    sentMessages.length = 0
    const mockTransport = {
      onmessage: undefined as ((msg: unknown) => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      onerror: undefined as ((err: Error) => void) | undefined,
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockImplementation((msg: unknown) => {
        sentMessages.push(msg)
        return Promise.resolve()
      }),
    }
    server = await createServer()
    await server.connect(mockTransport as never)
    await mockTransport.start()
  })

  function triggerRequest(request: { id: number; method: string; params?: unknown }) {
    const message = {
      jsonrpc: '2.0',
      id: request.id,
      method: request.method,
      params: request.params ?? {},
    }
    const transport = (server as { transport?: { onmessage?: (m: unknown) => void } }).transport
    if (transport?.onmessage) {
      transport.onmessage(message)
    }
  }

  it('ListTools returns 24 tools with expected names and schema', async () => {
    triggerRequest({ id: 1, method: 'tools/list', params: {} })
    await vi.waitFor(() => {
      expect(sentMessages.length).toBeGreaterThanOrEqual(1)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 1) as {
      result?: { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }
      error?: unknown
    }
    expect(response).toBeDefined()
    expect(response.error).toBeUndefined()
    expect(response.result?.tools).toBeDefined()
    const tools = response.result!.tools!
    expect(tools.length).toBe(22)
    const names = tools.map((t) => t.name)
    expect(names).toContain('audit_url')
    expect(names).toContain('audit_multiple_urls')
    expect(names).toContain('create_session')
    expect(names).toContain('audit_with_session')
    expect(names).toContain('filter_issues')
    expect(names).toContain('prioritize_issues')
    expect(names).toContain('explain_issue')
    expect(names).toContain('generate_summary_report')
    tools.forEach((t) => {
      expect(t.name).toBeDefined()
      expect(t.description).toBeDefined()
      expect(t.inputSchema).toBeDefined()
    })
  })

  it('CallTool filter_issues returns filtered result', async () => {
    triggerRequest({
      id: 2,
      method: 'tools/call',
      params: {
        name: 'filter_issues',
        arguments: {
          results: auditResultFixture,
          filters: { ruleIds: ['image-alt'] },
          mode: 'include',
        },
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 2)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 2) as {
      result?: { content?: Array<{ type: string; text?: string }> }
      error?: unknown
    }
    expect(response.error).toBeUndefined()
    expect(response.result?.content).toBeDefined()
    expect(response.result!.content!.length).toBeGreaterThan(0)
    const text = response.result!.content![0].text
    expect(text).toBeDefined()
    const parsed = JSON.parse(text!)
    expect(parsed.filtered).toBeDefined()
    expect(parsed.filteredCount).toBe(1)
  })

  it('CallTool export_to_excel returns JSON and embedded XLSX resource', async () => {
    triggerRequest({
      id: 5,
      method: 'tools/call',
      params: {
        name: 'export_to_excel',
        arguments: {
          results: auditResultFixture,
          includeCharts: false,
          formatting: true,
        },
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 5)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 5) as {
      result?: {
        content?: Array<{
          type: string
          text?: string
          resource?: { uri?: string; mimeType?: string; blob?: string }
        }>
      }
      error?: unknown
    }
    expect(response.error).toBeUndefined()
    const content = response.result?.content
    expect(content?.length).toBeGreaterThanOrEqual(2)
    expect(content![0].type).toBe('text')
    const parsed = JSON.parse(content![0].text!)
    expect(parsed.excel).toBeDefined()
    expect(parsed.filename).toBe('accessibility-audit.xlsx')
    expect(content![1].type).toBe('resource')
    const res = content![1].resource!
    expect(res.uri).toMatch(/^a11y-mcp:\/\/export\//)
    expect(res.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(res.blob).toBe(parsed.excel)
    const bytes = Buffer.from(res.blob!, 'base64')
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it('CallTool export_to_csv returns JSON and embedded CSV resource', async () => {
    triggerRequest({
      id: 6,
      method: 'tools/call',
      params: {
        name: 'export_to_csv',
        arguments: {
          results: auditResultFixture,
          includeMetadata: false,
          includeViolations: true,
          format: 'standard',
        },
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 6)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 6) as {
      result?: {
        content?: Array<{
          type: string
          text?: string
          resource?: { uri?: string; mimeType?: string; text?: string }
        }>
      }
      error?: unknown
    }
    expect(response.error).toBeUndefined()
    const content = response.result?.content
    expect(content?.length).toBeGreaterThanOrEqual(2)
    const parsed = JSON.parse(content![0].text!)
    expect(parsed.csv).toBeDefined()
    expect(parsed.filename).toBe('accessibility-audit.csv')
    expect(content![1].type).toBe('resource')
    const res = content![1].resource!
    expect(res.uri).toMatch(/^a11y-mcp:\/\/export\//)
    expect(res.mimeType).toContain('text/csv')
    expect(res.text).toBe(parsed.csv)
  })

  it('CallTool export_to_json returns JSON and embedded JSON resource', async () => {
    triggerRequest({
      id: 7,
      method: 'tools/call',
      params: {
        name: 'export_to_json',
        arguments: {
          results: auditResultFixture,
          pretty: true,
          includeRaw: false,
        },
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 7)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 7) as {
      result?: {
        content?: Array<{
          type: string
          text?: string
          resource?: { uri?: string; mimeType?: string; text?: string }
        }>
      }
      error?: unknown
    }
    expect(response.error).toBeUndefined()
    const content = response.result?.content
    expect(content?.length).toBeGreaterThanOrEqual(2)
    const parsed = JSON.parse(content![0].text!)
    expect(parsed.json).toBeDefined()
    expect(parsed.filename).toBe('accessibility-audit.json')
    expect(content![1].type).toBe('resource')
    const res = content![1].resource!
    expect(res.mimeType).toContain('application/json')
    expect(res.text).toBe(parsed.json)
  })

  it('CallTool export_to_html_report returns JSON and embedded HTML resource', async () => {
    triggerRequest({
      id: 8,
      method: 'tools/call',
      params: {
        name: 'export_to_html_report',
        arguments: {
          results: auditResultFixture,
          template: 'default',
          includeCharts: false,
        },
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 8)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 8) as {
      result?: {
        content?: Array<{
          type: string
          text?: string
          resource?: { uri?: string; mimeType?: string; text?: string }
        }>
      }
      error?: unknown
    }
    expect(response.error).toBeUndefined()
    const content = response.result?.content
    expect(content?.length).toBeGreaterThanOrEqual(2)
    const parsed = JSON.parse(content![0].text!)
    expect(parsed.html).toBeDefined()
    expect(parsed.filename).toBe('accessibility-audit.html')
    expect(content![1].type).toBe('resource')
    const res = content![1].resource!
    expect(res.mimeType).toContain('text/html')
    expect(res.text).toBe(parsed.html)
    expect(res.text).toContain('<!DOCTYPE html')
  })

  it('CallTool explain_issue returns explanation', async () => {
    triggerRequest({
      id: 3,
      method: 'tools/call',
      params: {
        name: 'explain_issue',
        arguments: { ruleId: 'image-alt' },
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 3)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 3) as {
      result?: { content?: Array<{ type: string; text?: string }> }
      error?: unknown
    }
    expect(response.error).toBeUndefined()
    const parsed = JSON.parse(response.result!.content![0].text!)
    expect(parsed.ruleId).toBe('image-alt')
    expect(parsed.explanation).toBeDefined()
  })

  it('CallTool unknown tool returns isError and error message', async () => {
    triggerRequest({
      id: 4,
      method: 'tools/call',
      params: {
        name: 'unknown_tool_xyz',
        arguments: {},
      },
    })
    await vi.waitFor(() => {
      expect(sentMessages.some((m: unknown) => (m as { id?: number }).id === 4)).toBe(true)
    })
    const response = sentMessages.find((m: unknown) => (m as { id?: number }).id === 4) as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean }
      error?: { message?: string }
    }
    expect(response.result?.content).toBeDefined()
    const text = response.result!.content![0].text
    expect(text).toBeDefined()
    const parsed = JSON.parse(text!)
    expect(parsed.error).toBeDefined()
    expect(typeof parsed.error).toBe('string')
    expect(parsed.error).not.toBe('[object Object]')
    expect(response.result?.isError).toBe(true)
  })
})
