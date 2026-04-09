/**
 * Post-filter ACE results by configured WCAG_LEVEL (A / AA / AAA) using rule toolkit levels from metadata.
 */

import type { WcagLevel } from './config.js'
import type {
  AccessibilityReport,
  AccessibilityResults,
  AccessibilityRuleData,
} from '../types/index.js'
import { getAceRuleMeta } from './ace-rule-metadata.js'

function configuredLevelMaxRank(wcagLevel: WcagLevel): number {
  if (wcagLevel.endsWith('_AAA')) return 3
  if (wcagLevel.endsWith('_AA')) return 2
  return 1
}

/** IBM engine toolkit level → numeric rank (1=A, 2=AA, 3=AAA). */
function toolkitRank(toolkitLevel: string): number {
  switch (toolkitLevel) {
    case 'LEVEL_ONE':
      return 1
    case 'LEVEL_TWO':
      return 2
    case 'LEVEL_THREE':
    case 'LEVEL_FOUR':
      return 3
    default:
      return 0
  }
}

/**
 * Drop rules whose mapped toolkit level exceeds the configured WCAG_LEVEL.
 * Rules with no metadata are kept (avoid false negatives).
 */
export function filterAceResultsByWcagLevel(
  results: AccessibilityResults,
  wcagLevel: WcagLevel,
  activeAcePolicies: readonly string[]
): AccessibilityResults {
  const maxR = configuredLevelMaxRank(wcagLevel)
  const filteredViolations: AccessibilityReport = {}

  Object.entries(results.violations).forEach(([categoryKey, category]) => {
    if (!category?.items) return
    const filteredItems: Record<string, AccessibilityRuleData> = {}
    Object.entries(category.items).forEach(([ruleId, ruleData]) => {
      const meta = getAceRuleMeta(ruleId, activeAcePolicies)
      if (!meta) {
        filteredItems[ruleId] = ruleData
        return
      }
      const tr = toolkitRank(meta.toolkitLevel)
      if (tr === 0 || tr <= maxR) {
        filteredItems[ruleId] = ruleData
      }
    })
    if (Object.keys(filteredItems).length > 0) {
      const categoryCount = Object.values(filteredItems).reduce(
        (total, item) => total + (item.count || 0),
        0
      )
      filteredViolations[categoryKey] = {
        count: categoryCount,
        items: filteredItems,
      }
    }
  })

  return { ...results, violations: filteredViolations }
}
