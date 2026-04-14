import { describe, it, expect } from 'vitest'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import {
  getAccessibilityPrompt,
  listAccessibilityPrompts,
} from '../../../src/prompts/accessibility-prompts.js'

describe('accessibility-prompts', () => {
  it('listAccessibilityPrompts returns one entry per known template', () => {
    const list = listAccessibilityPrompts()
    expect(list.length).toBe(15)
    const names = new Set(list.map((p) => p.name))
    expect(names.has('audit-single-url')).toBe(true)
    expect(names.has('full-accessibility-toolkit-runbook')).toBe(true)
  })

  it('getAccessibilityPrompt resolves audit-single-url with url', () => {
    const r = getAccessibilityPrompt('audit-single-url', { url: 'https://example.com' })
    expect(r.messages.length).toBe(1)
    expect(r.messages[0].role).toBe('user')
    expect(r.messages[0].content.type).toBe('text')
    if (r.messages[0].content.type === 'text') {
      expect(r.messages[0].content.text).toContain('audit_url')
      expect(r.messages[0].content.text).toContain('https://example.com')
    }
  })

  it('getAccessibilityPrompt throws on missing required argument', () => {
    expect(() => getAccessibilityPrompt('audit-single-url', {})).toThrow(McpError)
    try {
      getAccessibilityPrompt('audit-single-url', {})
    } catch (e) {
      expect(e).toBeInstanceOf(McpError)
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams)
    }
  })

  it('getAccessibilityPrompt throws on unknown name', () => {
    expect(() => getAccessibilityPrompt('no-such-prompt', {})).toThrow(McpError)
  })
})
