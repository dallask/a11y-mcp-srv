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

/** Detect "Failed to launch the browser process" (often missing system deps on Linux/Docker). */
export function isLaunchFailureError(error: unknown): boolean {
  const msg = toErrorMessage(error).toLowerCase()
  return msg.includes('failed to launch the browser process')
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

/**
 * Run `playwright install chromium --with-deps` to install browser + system dependencies
 * (e.g. libgbm, libnss3 on Linux). Use when the browser binary exists but fails to launch.
 * May require root/sudo in some environments; best-effort only.
 */
function installPlaywrightChromiumWithDeps(): void {
  const cliPath = getPlaywrightCliPath()
  const node = process.execPath
  console.error('[accessibility-mcp-server] Installing Chromium with system dependencies (--with-deps)...')
  try {
    execSync(`"${node}" "${cliPath}" install chromium --with-deps`, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
    })
    console.error('[accessibility-mcp-server] Chromium + deps install completed.')
  } catch (err) {
    const msg = toErrorMessage(err)
    console.error(`[accessibility-mcp-server] install --with-deps failed: ${msg}`)
    throw new Error(
      `Chromium system-deps install failed: ${msg}. You may need to run 'npx playwright install --with-deps' manually with appropriate permissions.`
    )
  }
}

export type LaunchOptions = Parameters<typeof chromium.launch>[0]

/**
 * Chromium args that improve launch success in CI, containers, and restricted environments
 * (e.g. CodeMie, Docker, headless Linux). Reduces GPU/sandbox/display issues.
 */
const ROBUST_LAUNCH_ARGS = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-hang-monitor',
  '--disable-prompt-on-repost',
  '--disable-client-side-phishing-detection',
  '--run-all-compositor-stages-before-draw',
]

/**
 * Merge caller args with robust defaults (caller args take precedence; no duplicates).
 */
function mergeLaunchArgs(callerArgs: string[] | undefined): string[] {
  const seen = new Set(ROBUST_LAUNCH_ARGS)
  const out = [...ROBUST_LAUNCH_ARGS]
  if (Array.isArray(callerArgs)) {
    for (const a of callerArgs) {
      const flag = a.split('=')[0]
      if (!seen.has(flag)) {
        seen.add(flag)
        out.push(a)
      }
    }
  }
  return out
}

/**
 * Launch Chromium, installing the browser if missing (e.g. first run in CodeMie).
 * Retries launch once after install on "Executable doesn't exist".
 * On "Failed to launch the browser process", tries `playwright install chromium --with-deps` and retries once.
 * Uses robust launch args for CI/containers; caller args are merged in.
 */
export async function launchChromium(options: LaunchOptions): Promise<Browser> {
  const args = mergeLaunchArgs(options?.args as string[] | undefined)
  const launchOpts: LaunchOptions = {
    ...options,
    headless: options?.headless !== false,
    args,
  }

  const tryLaunch = async (): Promise<Browser> => chromium.launch(launchOpts)

  try {
    return await tryLaunch()
  } catch (error) {
    if (isMissingBrowserError(error)) {
      installPlaywrightChromium()
      return await tryLaunch()
    }
    if (isLaunchFailureError(error)) {
      installPlaywrightChromiumWithDeps()
      return await tryLaunch()
    }
    throw error
  }
}
