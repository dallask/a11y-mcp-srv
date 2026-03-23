/**
 * Caches IBM accessibility-checker module load and setConfig({ policies, ruleArchive })
 * so repeated ACE audits do not re-parse / re-apply the same policy bundle per URL.
 */

let checkerModule: typeof import('accessibility-checker') | null = null
let lastConfigKey = ''

function configKey(policies: string[], ruleArchive: string): string {
  return `${[...policies].sort().join(',')}|${ruleArchive}`
}

/**
 * Loads accessibility-checker once and calls setConfig only when policies or archive change.
 */
export async function getConfiguredAceChecker(
  policies: string[],
  ruleArchive: string = 'latest'
): Promise<typeof import('accessibility-checker')> {
  if (!checkerModule) {
    checkerModule = await import('accessibility-checker')
  }
  const key = configKey(policies, ruleArchive)
  if (key !== lastConfigKey) {
    await checkerModule.setConfig({ policies, ruleArchive })
    lastConfigKey = key
  }
  return checkerModule
}

/**
 * For tests: reset module and config cache.
 */
export function resetAcePolicyCacheForTests(): void {
  checkerModule = null
  lastConfigKey = ''
}
