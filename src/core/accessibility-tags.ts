/**
 * Allowed accessibility tag values for audit tools (axe + ACE scoping).
 */
import type { AccessibilityTag } from '../types/index.js'

export const VALID_ACCESSIBILITY_TAGS: readonly AccessibilityTag[] = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag21aaa',
  'wcag22a',
  'wcag22aa',
  'wcag22aaa',
  'best-practice',
]

export function isValidAccessibilityTag(tag: string): tag is AccessibilityTag {
  return (VALID_ACCESSIBILITY_TAGS as readonly string[]).includes(tag)
}
