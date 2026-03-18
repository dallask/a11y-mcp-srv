import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  toErrorMessage,
  categorizeError,
  formatErrorMessage,
  handleErrorGracefully,
  retryWithBackoff,
  isTransientError,
  ErrorCategory,
} from '../../../src/core/error-handler.js'

describe('toErrorMessage', () => {
  it('returns "null" for null', () => {
    expect(toErrorMessage(null)).toBe('null')
  })

  it('returns "undefined" for undefined', () => {
    expect(toErrorMessage(undefined)).toBe('undefined')
  })

  it('returns message for Error instance', () => {
    expect(toErrorMessage(new Error('fail'))).toBe('fail')
  })

  it('returns name when message is empty', () => {
    const err = new Error('')
    err.message = ''
    expect(toErrorMessage(err)).toBe('Error')
  })

  it('extracts message from object with message property', () => {
    expect(toErrorMessage({ message: 'obj message' })).toBe('obj message')
  })

  it('extracts from object with msg property', () => {
    expect(toErrorMessage({ msg: 'obj msg' })).toBe('obj msg')
  })

  it('extracts from object with error property', () => {
    expect(toErrorMessage({ error: 'obj error' })).toBe('obj error')
  })

  it('extracts from object with reason property', () => {
    expect(toErrorMessage({ reason: 'obj reason' })).toBe('obj reason')
  })

  it('returns JSON string for object with no known message key', () => {
    const obj = { code: 'ERR', detail: 'x' }
    const result = toErrorMessage(obj)
    expect(result).toContain('ERR')
    expect(result).toContain('detail')
  })

  it('truncates long JSON to 500 chars', () => {
    const obj = { x: 'a'.repeat(600) }
    const result = toErrorMessage(obj)
    expect(result.length).toBeLessThanOrEqual(503)
    expect(result.endsWith('...')).toBe(true)
  })

  it('returns string for primitive', () => {
    expect(toErrorMessage('hello')).toBe('hello')
    expect(toErrorMessage(42)).toBe('42')
  })
})

describe('categorizeError', () => {
  it('categorizes network errors', () => {
    const e = categorizeError(new Error('net::ERR_CONNECTION_REFUSED'))
    expect(e.category).toBe(ErrorCategory.NETWORK)
    expect(e.retryable).toBe(true)

    expect(categorizeError(new Error('ECONNREFUSED')).category).toBe(ErrorCategory.NETWORK)
    expect(categorizeError(new Error('ENOTFOUND')).category).toBe(ErrorCategory.NETWORK)
    expect(categorizeError(new Error('fetch failed')).category).toBe(ErrorCategory.NETWORK)
  })

  it('categorizes timeout errors', () => {
    expect(categorizeError(new Error('timeout')).category).toBe(ErrorCategory.TIMEOUT)
    expect(categorizeError(new Error('Navigation timeout')).category).toBe(ErrorCategory.TIMEOUT)
    expect(categorizeError(new Error('waiting for selector')).category).toBe(ErrorCategory.TIMEOUT)
  })

  it('categorizes browser errors', () => {
    expect(categorizeError(new Error('Browser closed')).category).toBe(ErrorCategory.BROWSER)
    expect(categorizeError(new Error('Target closed')).category).toBe(ErrorCategory.BROWSER)
    expect(categorizeError(new Error('page crash')).category).toBe(ErrorCategory.BROWSER)
  })

  it('categorizes session errors', () => {
    expect(categorizeError(new Error('session expired')).category).toBe(ErrorCategory.SESSION)
    expect(categorizeError(new Error('authentication failed')).category).toBe(ErrorCategory.SESSION)
  })

  it('categorizes validation errors', () => {
    expect(categorizeError(new Error('required field missing')).category).toBe(ErrorCategory.VALIDATION)
    expect(categorizeError(new Error('invalid input')).category).toBe(ErrorCategory.VALIDATION)
  })

  it('categorizes unknown errors', () => {
    const e = categorizeError(new Error('something random'))
    expect(e.category).toBe(ErrorCategory.UNKNOWN)
    expect(e.retryable).toBe(false)
  })
})

describe('formatErrorMessage', () => {
  it('includes context prefix when provided', () => {
    const msg = formatErrorMessage(new Error('err'), 'Tool: audit_url')
    expect(msg).toContain('[Tool: audit_url]')
    expect(msg).toContain('err')
  })

  it('includes suggestion for network errors', () => {
    const msg = formatErrorMessage(new Error('ECONNREFUSED'))
    expect(msg).toContain('Suggestion')
    expect(msg).toContain('connection')
  })

  it('includes suggestion for timeout, browser, session, validation', () => {
    expect(formatErrorMessage(new Error('timeout'))).toContain('Suggestion')
    expect(formatErrorMessage(new Error('Browser crashed'))).toContain('Suggestion')
    expect(formatErrorMessage(new Error('session expired'))).toContain('Suggestion')
    expect(formatErrorMessage(new Error('invalid input'))).toContain('Suggestion')
  })
})

describe('handleErrorGracefully', () => {
  it('returns error string, category, retryable, and suggestion', () => {
    const result = handleErrorGracefully(new Error('fail'), 'Test')
    expect(typeof result.error).toBe('string')
    expect(result.error).toContain('fail')
    expect(Object.values(ErrorCategory)).toContain(result.category)
    expect(typeof result.retryable).toBe('boolean')
    expect(result.suggestion).toBeDefined()
  })

  it('never returns [object Object] for error field', () => {
    const result = handleErrorGracefully({ message: 'custom' })
    expect(result.error).not.toBe('[object Object]')
    expect(result.error).toContain('custom')
  })

  it('returns install playwright suggestion for browser launch failure', () => {
    const result = handleErrorGracefully(
      new Error('Failed to launch the browser process')
    )
    expect(result.category).toBe(ErrorCategory.BROWSER)
    expect(result.suggestion).toContain('playwright install')
  })
})

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue(42)
    const p = retryWithBackoff(fn, { maxRetries: 2 })
    await vi.runAllTimersAsync()
    const result = await p
    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(100)
    const p = retryWithBackoff(fn, { maxRetries: 2, initialDelay: 10 })
    await vi.runAllTimersAsync()
    const result = await p
    expect(result).toBe(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws on non-retryable (validation) error without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid input'))
    const p = retryWithBackoff(fn, { maxRetries: 2 })
    await expect(p).rejects.toMatchObject({ category: ErrorCategory.VALIDATION })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws after maxRetries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))
    const p = retryWithBackoff(fn, { maxRetries: 1, initialDelay: 1 })
    const rejection = expect(p).rejects.toMatchObject({ category: ErrorCategory.TIMEOUT })
    await vi.runAllTimersAsync()
    await rejection
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('isTransientError', () => {
  it('returns true for retryable errors', () => {
    expect(isTransientError(new Error('timeout'))).toBe(true)
    expect(isTransientError(new Error('net::ERR'))).toBe(true)
  })

  it('returns false for non-retryable errors', () => {
    expect(isTransientError(new Error('invalid input'))).toBe(false)
  })
})
