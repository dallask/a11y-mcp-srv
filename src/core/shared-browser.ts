/**
 * Single shared Chromium instance for the MCP server process.
 * Avoids per-audit browser launch/teardown (major latency win).
 */

import type { Browser } from 'playwright'
import { launchChromium } from './playwright-bootstrap.js'
import { retryWithBackoff } from './error-handler.js'
import { getConfig } from './config.js'

let sharedBrowser: Browser | null = null
let browserLaunchPromise: Promise<Browser> | null = null

/**
 * Returns a connected Playwright Browser, launching and reusing one instance per process.
 */
export async function acquireSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser
  }

  if (!browserLaunchPromise) {
    const config = getConfig()
    browserLaunchPromise = (async () => {
      try {
        const browser = await retryWithBackoff(
          async () =>
            launchChromium({
              headless: config.headless,
              args: [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
              ],
            }),
          {
            maxRetries: 2,
            initialDelay: 1000,
          }
        )
        sharedBrowser = browser
        browser.on('disconnected', () => {
          sharedBrowser = null
          browserLaunchPromise = null
        })
        return browser
      } catch (e) {
        browserLaunchPromise = null
        throw e
      }
    })()
  }

  return browserLaunchPromise
}

/**
 * Close the shared browser (e.g. process shutdown). Safe to call multiple times.
 */
export async function shutdownSharedBrowser(): Promise<void> {
  browserLaunchPromise = null
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => undefined)
    sharedBrowser = null
  }
}
