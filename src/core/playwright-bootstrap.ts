/**
 * Ensures Playwright browsers are installed when running in environments (e.g. CodeMie, CI)
 * where they may not be pre-installed. On "Executable doesn't exist", runs
 * `playwright install chromium` and retries the launch.
 */

import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { toErrorMessage } from './error-handler.js'

/** Detect the "Executable doesn't exist" error from Playwright (missing browser install). */
export function isMissingBrowserError(error: unknown): boolean {
  const msg = toErrorMessage(error).toLowerCase()
  return (
    (msg.includes('executable doesn\'t exist') || msg.includes('executable does not exist')) &&
    (msg.includes('ms-playwright') || msg.includes('chromium_headless_shell') || msg.includes('playwright'))
  )
}

/** Resolve path to the Playwright CLI (same package as the one we import). */
function getPlaywrightCliPath(): string {
  const require = createRequire(import.meta.url)
  const playwrightDir = dirname(require.resolve('playwright/package.json'))
  return join(playwrightDir, 'cli.js')
}

/** Run `playwright install chromium` so the current process's cache has the browser. */
export function installPlaywrightChromium(): void {
  const cliPath = getPlaywrightCliPath()
  const node = process.execPath
  console.error('[accessibility-mcp-server] Installing Playwright Chromium (one-time or after update)...')
  try {
    execSync(`"${node}" "${cliPath}" install chromium`, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
    })
    console.error('[accessibility-mcp-server] Playwright Chromium install completed.')
  } catch (err) {
    const msg = toErrorMessage(err)
    console.error(`[accessibility-mcp-server] Playwright install failed: ${msg}`)
    throw new Error(`Playwright Chromium install failed: ${msg}`)
  }
}

export type LaunchOptions = Parameters<typeof chromium.launch>[0]

/**
 * Launch Chromium, installing the browser if missing (e.g. first run in CodeMie).
 * Retries launch once after install on "Executable doesn't exist".
 */
export async function launchChromium(options: LaunchOptions): Promise<Browser> {
  try {
    return await chromium.launch(options)
  } catch (error) {
    if (!isMissingBrowserError(error)) throw error
    installPlaywrightChromium()
    return await chromium.launch(options)
  }
}
