/**
 * Maps audit tags + WCAG_LEVEL config to IBM accessibility-checker policy ids for setConfig({ policies }).
 */

import type { AccessibilityTag } from '../types/index.js'
import { getAcePolicyFromConfig } from './config.js'

/**
 * @param tags - Resolved tag list (from config or user)
 * @param userProvidedTags - True when the MCP tool supplied explicit tags
 */
export function resolveAcePolicies(
  tags: AccessibilityTag[] | undefined,
  userProvidedTags: boolean
): string[] {
  const list = tags && tags.length > 0 ? tags : []
  const wcagPolicy = userProvidedTags
    ? policyFromTagPrefixes(list)
    : getAcePolicyFromConfig()
  const policies = new Set<string>([wcagPolicy])
  if (list.includes('best-practice')) {
    policies.add('IBM_Accessibility')
  }
  return [...policies].sort()
}

function policyFromTagPrefixes(tags: readonly AccessibilityTag[]): string {
  if (tags.some((t) => t.startsWith('wcag22'))) return 'WCAG_2_2'
  if (tags.some((t) => t.startsWith('wcag21'))) return 'WCAG_2_1'
  if (tags.some((t) => t.startsWith('wcag2'))) return 'WCAG_2_0'
  return 'IBM_Accessibility'
}
