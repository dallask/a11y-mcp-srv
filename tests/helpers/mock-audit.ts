/**
 * Helper to get fixture audit result for use in tests that mock auditUrl.
 * Use with vi.mock('../../../src/tools/audit.js') and return this from auditUrl.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(__dirname, '../fixtures/audit-result.json')

export const fixtureAuditResult = JSON.parse(
  readFileSync(fixturePath, 'utf-8')
) as Record<string, unknown>
