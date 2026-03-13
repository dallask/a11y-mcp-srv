/**
 * Shared HTTP Basic Auth utilities for tools that use URLs.
 * Use when auditing or fetching URLs that require Basic Authentication.
 */

export interface ParsedUrlCredentials {
  urlWithoutAuth: string
  username?: string
  password?: string
}

export interface BasicAuthParams {
  basicAuthUsername?: string
  basicAuthPassword?: string
}

/**
 * Parse Basic Auth credentials from URL if present (e.g. https://user:password@host/path).
 * Returns URL with credentials stripped and optional username/password.
 */
export function parseUrlCredentials(url: string): ParsedUrlCredentials {
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) {
      const username = decodeURIComponent(parsed.username)
      const password = decodeURIComponent(parsed.password)
      parsed.username = ''
      parsed.password = ''
      return { urlWithoutAuth: parsed.toString(), username, password }
    }
  } catch {
    // ignore invalid URL
  }
  return { urlWithoutAuth: url }
}

/**
 * Build the Authorization header value for HTTP Basic Auth.
 * Returns "Basic <base64(user:password)>" or null if either credential is missing.
 */
export function getBasicAuthHeader(
  username: string | undefined,
  password: string | undefined
): string | null {
  if (username == null || password == null) return null
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

/**
 * Resolve URL and Basic Auth from a URL (possibly with user:password@host) and optional
 * explicit username/password. Explicit params override credentials embedded in the URL.
 * Returns normalized URL without auth and credentials suitable for passing to auditUrl etc.
 */
export function resolveBasicAuth(
  url: string,
  explicitUsername?: string,
  explicitPassword?: string
): {
  urlWithoutAuth: string
  basicAuthUsername: string | undefined
  basicAuthPassword: string | undefined
  basicAuthHeader: string | null
} {
  const parsed = parseUrlCredentials(url)
  const basicAuthUsername = explicitUsername ?? parsed.username
  const basicAuthPassword = explicitPassword ?? parsed.password
  const basicAuthHeader = getBasicAuthHeader(basicAuthUsername, basicAuthPassword)
  return {
    urlWithoutAuth: parsed.urlWithoutAuth,
    basicAuthUsername,
    basicAuthPassword,
    basicAuthHeader,
  }
}
