import { describe, it, expect } from 'vitest'
import {
  parseUrlCredentials,
  getBasicAuthHeader,
  resolveBasicAuth,
} from '../../../src/core/basic-auth.js'

describe('parseUrlCredentials', () => {
  it('returns urlWithoutAuth only when URL has no credentials', () => {
    const result = parseUrlCredentials('https://example.com/path')
    expect(result.urlWithoutAuth).toBe('https://example.com/path')
    expect(result.username).toBeUndefined()
    expect(result.password).toBeUndefined()
  })

  it('strips credentials from URL and returns username/password', () => {
    const result = parseUrlCredentials('https://user:pass@example.com/')
    expect(result.urlWithoutAuth).toBe('https://example.com/')
    expect(result.username).toBe('user')
    expect(result.password).toBe('pass')
  })

  it('decodes URL-encoded credentials', () => {
    const result = parseUrlCredentials('https://user%40:p%40ss@example.com/')
    expect(result.username).toBe('user@')
    expect(result.password).toBe('p@ss')
  })

  it('returns original URL for invalid URL', () => {
    const result = parseUrlCredentials('not-a-url')
    expect(result.urlWithoutAuth).toBe('not-a-url')
  })
})

describe('getBasicAuthHeader', () => {
  it('returns null when username or password is missing', () => {
    expect(getBasicAuthHeader(undefined, 'pass')).toBeNull()
    expect(getBasicAuthHeader('user', undefined)).toBeNull()
    expect(getBasicAuthHeader(undefined, undefined)).toBeNull()
  })

  it('returns "Basic " + base64(user:password)', () => {
    const header = getBasicAuthHeader('alice', 'secret')
    expect(header).toMatch(/^Basic [A-Za-z0-9+/=]+$/)
    expect(Buffer.from(header!.slice(6), 'base64').toString('utf-8')).toBe('alice:secret')
  })
})

describe('resolveBasicAuth', () => {
  it('returns urlWithoutAuth and credentials from URL when no explicit params', () => {
    const result = resolveBasicAuth('https://u:p@example.com/')
    expect(result.urlWithoutAuth).toBe('https://example.com/')
    expect(result.basicAuthUsername).toBe('u')
    expect(result.basicAuthPassword).toBe('p')
    expect(result.basicAuthHeader).toMatch(/^Basic /)
  })

  it('uses explicit username/password over URL credentials', () => {
    const result = resolveBasicAuth(
      'https://urluser:urlpass@example.com/',
      'explicitUser',
      'explicitPass'
    )
    expect(result.urlWithoutAuth).toBe('https://example.com/')
    expect(result.basicAuthUsername).toBe('explicitUser')
    expect(result.basicAuthPassword).toBe('explicitPass')
    expect(Buffer.from(result.basicAuthHeader!.slice(6), 'base64').toString('utf-8')).toBe('explicitUser:explicitPass')
  })

  it('returns basicAuthHeader null when no credentials available', () => {
    const result = resolveBasicAuth('https://example.com/')
    expect(result.basicAuthHeader).toBeNull()
    expect(result.basicAuthUsername).toBeUndefined()
    expect(result.basicAuthPassword).toBeUndefined()
  })
})
