/**
 * Analysis & reporting tools
 * Implements: get_accessibility_score, prioritize_issues, explain_issue, get_quick_fixes
 */

import { auditUrl } from './audit.js'
import type {
  AuditResult,
  ScoreInput,
  ScoreResult,
  WCAGCompliance,
  PrioritizeIssuesInput,
  PrioritizeIssuesResult,
  PrioritizedIssue,
  QuickWin,
  CriticalBlocker,
  ExplainIssueInput,
  IssueExplanation,
  QuickFixesInput,
  QuickFixesResult,
  QuickFixItem,
  GenerateComplianceReportInput,
  ComplianceReport,
  ComplianceReportFormat,
  WCAGLevel,
  ComplianceStatus,
  WCAGComplianceInput,
  WCAGComplianceResult,
  WCAGCriterion,
} from '../types/index.js'
import { IMPACT_ORDER } from '../types/index.js'
import { wcagLevelMatches, wcagLevelOrder } from '../core/result-processor.js'

function impactRank(impact: string): number {
  return IMPACT_ORDER[impact.toLowerCase()] ?? 2
}

/**
 * Default weights for different issue types when calculating scores (axe + ACE native levels)
 */
const DEFAULT_WEIGHTS: Record<string, number> = {
  critical: 5.0,
  serious: 3.0,
  moderate: 1.0,
  minor: 0.5,
  violation: 5.0,
  potentialviolation: 4.0,
  potentialrecommendation: 3.0,
  recommendation: 2.0,
  manual: 3.0,
  pass: 0.5,
  ignored: 0,
  // Category-based weights
  error: 5.0,
  contrast: 3.0,
  alert: 1.0,
  feature: 0.5,
  structure: 1.0,
  aria: 2.0,
}

/**
 * Calculate breakdown by category
 */
function calculateCategoryBreakdown(
  issues: PrioritizedIssue[],
  weights: Record<string, number>
): Record<string, number> {
  const breakdown: Record<string, number> = {}
  const categoryScores: Record<string, { total: number; count: number }> = {}

  issues.forEach((issue) => {
    const category = issue.category || 'unknown'
    const impactWeight = weights[issue.impact] || DEFAULT_WEIGHTS[issue.impact] || 1.0
    const categoryWeight = weights[category] || DEFAULT_WEIGHTS[category] || 1.0
    const combinedWeight = (impactWeight + categoryWeight) / 2

    if (!categoryScores[category]) {
      categoryScores[category] = { total: 0, count: 0 }
    }

    categoryScores[category].total += combinedWeight
    categoryScores[category].count += 1
  })

  // Calculate average score per category (lower is better, so we subtract from 100)
  Object.entries(categoryScores).forEach(([category, data]) => {
    const avgPenalty = data.total / Math.max(data.count, 1)
    breakdown[category] = Math.max(0, Math.round(100 - avgPenalty * 10))
  })

  return breakdown
}

/**
 * Calculate WCAG compliance percentages
 */
function calculateWCAGCompliance(issues: PrioritizedIssue[]): WCAGCompliance {
  if (issues.length === 0) {
    return { A: 100, AA: 100, AAA: 100 }
  }

  // Count issues by WCAG level
  const levelA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'A'))
  const levelAA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AA'))
  const levelAAA = issues.filter((i) => wcagLevelMatches(i.wcagLevel, 'AAA'))

  // Calculate compliance as percentage
  // This is a simplified calculation - assumes each issue represents a criterion violation
  const totalIssues = issues.length
  const complianceA = totalIssues > 0 
    ? Math.max(0, Math.round(100 - (levelA.length / totalIssues) * 100)) 
    : 100
  const complianceAA = totalIssues > 0 
    ? Math.max(0, Math.round(100 - (levelAA.length / totalIssues) * 100)) 
    : 100
  const complianceAAA = totalIssues > 0 
    ? Math.max(0, Math.round(100 - (levelAAA.length / totalIssues) * 100)) 
    : 100

  return {
    A: complianceA,
    AA: complianceAA,
    AAA: complianceAAA,
  }
}

/**
 * Calculate overall accessibility score (0-100)
 * Higher score = better accessibility
 */
function calculateOverallScore(
  issues: PrioritizedIssue[],
  weights: Record<string, number>
): number {
  if (issues.length === 0) {
    return 100
  }

  // Start with perfect score
  let score = 100

  // Deduct points based on issues and their weights
  issues.forEach((issue) => {
    const impactWeight = weights[issue.impact] || DEFAULT_WEIGHTS[issue.impact] || 1.0
    const categoryWeight = weights[issue.category || 'unknown'] || DEFAULT_WEIGHTS[issue.category || 'unknown'] || 1.0
    const combinedWeight = (impactWeight + categoryWeight) / 2

    // Deduct points proportional to the weight
    score -= combinedWeight * 0.5
  })

  // Ensure score stays within bounds
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * get_accessibility_score - Calculate accessibility score (0-100) with breakdowns
 * 
 * Calculates an overall accessibility score from audit results, with detailed
 * breakdowns by category and WCAG compliance levels. Supports custom weights
 * for different issue types.
 * 
 * @param input - Score calculation input (results or URL, optional weights)
 * @returns Score result with overall score, breakdowns, and WCAG compliance
 */
export async function getAccessibilityScore(
  input: ScoreInput
): Promise<ScoreResult> {
  let auditResult: AuditResult

  // If input is a URL string, run an audit first
  if (typeof input.results === 'string') {
    auditResult = await auditUrl({
      url: input.results,
    })
  } else {
    auditResult = input.results
  }

  // Merge custom weights with defaults
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(input.weights || {}),
  }

  // Calculate overall score
  const overallScore = calculateOverallScore(
    auditResult.prioritizedIssues,
    weights
  )

  // Calculate breakdown by category
  const breakdown = calculateCategoryBreakdown(
    auditResult.prioritizedIssues,
    weights
  )

  // Calculate WCAG compliance
  const wcagCompliance = calculateWCAGCompliance(auditResult.prioritizedIssues)

  // Note: Trend data would require historical tracking, which is not implemented yet
  // This is a placeholder for future enhancement

  return {
    overallScore,
    breakdown,
    wcagCompliance,
  }
}

/**
 * Prioritize issues by impact, WCAG level, or fixability
 */
function prioritizeByCriteria(
  issues: PrioritizedIssue[],
  criteria: 'impact' | 'wcag' | 'fixability' | 'user-impact'
): PrioritizedIssue[] {
  const sorted = [...issues]

  switch (criteria) {
    case 'impact': {
      // Sort by impact level (axe: critical/serious/moderate/minor; ACE: violation/...)
      sorted.sort((a, b) => {
        const impactDiff = impactRank(b.impact) - impactRank(a.impact)
        if (impactDiff !== 0) return impactDiff
        return b.priority - a.priority
      })
      break
    }

    case 'wcag': {
      // Sort by WCAG level (A > AA > AAA) - Level A violations are legal requirements
      sorted.sort((a, b) => {
        const levelDiff = wcagLevelOrder(b.wcagLevel) - wcagLevelOrder(a.wcagLevel)
        if (levelDiff !== 0) return levelDiff
        return impactRank(b.impact) - impactRank(a.impact)
      })
      break
    }

    case 'fixability': {
      // Sort by fixability (issues with clear fixes first)
      // Estimate fixability based on whether fix suggestion has actual code changes
      sorted.sort((a, b) => {
        const aHasFix = a.fix.suggested !== a.fix.current && a.fix.suggested.length > 0
        const bHasFix = b.fix.suggested !== b.fix.current && b.fix.suggested.length > 0
        
        if (aHasFix && !bHasFix) return -1
        if (!aHasFix && bHasFix) return 1
        
        // If both have fixes or both don't, sort by priority
        return b.priority - a.priority
      })
      break
    }

    case 'user-impact': {
      // Sort by user impact (axe/ACE native levels)
      sorted.sort((a, b) => {
        const impactDiff = impactRank(b.impact) - impactRank(a.impact)
        if (impactDiff !== 0) return impactDiff
        return wcagLevelOrder(b.wcagLevel) - wcagLevelOrder(a.wcagLevel)
      })
      break
    }
  }

  return sorted
}

/**
 * Identify quick wins - easy fixes with high impact
 */
function identifyQuickWins(issues: PrioritizedIssue[]): QuickWin[] {
  const quickWins: QuickWin[] = []

  // Group issues by rule ID
  const ruleGroups = new Map<string, PrioritizedIssue[]>()
  issues.forEach((issue) => {
    if (!ruleGroups.has(issue.ruleId)) {
      ruleGroups.set(issue.ruleId, [])
    }
    ruleGroups.get(issue.ruleId)!.push(issue)
  })

  ruleGroups.forEach((groupIssues, ruleId) => {
    // Quick wins are issues that:
    // 1. Have high impact (critical or serious)
    // 2. Have clear fix suggestions (suggested code differs from current)
    // 3. Affect multiple elements (batch fix opportunity)
    const highImpactIssues = groupIssues.filter((i) => impactRank(i.impact) >= 5)

    if (highImpactIssues.length > 0) {
      const firstIssue = groupIssues[0]
      const hasClearFix = 
        firstIssue.fix.suggested !== firstIssue.fix.current &&
        firstIssue.fix.suggested.length > 0 &&
        firstIssue.fix.explanation.length > 0

      // Consider it a quick win if:
      // - High impact AND (has clear fix OR affects multiple elements)
      if (hasClearFix || groupIssues.length > 1) {
        quickWins.push({
          ruleId,
          description: firstIssue.description,
          impact: firstIssue.impact,
          fix: firstIssue.fix,
          estimatedTime: `${Math.ceil(groupIssues.length * 2)} minutes`,
          affectedElements: groupIssues.length,
        })
      }
    }
  })

  // Sort by impact and number of affected elements
  quickWins.sort((a, b) => {
    const impactDiff = impactRank(b.impact) - impactRank(a.impact)
    if (impactDiff !== 0) return impactDiff
    return b.affectedElements - a.affectedElements
  })

  return quickWins.slice(0, 10) // Top 10 quick wins
}

/**
 * Identify critical blockers - must fix before launch
 */
function identifyCriticalBlockers(issues: PrioritizedIssue[]): CriticalBlocker[] {
  const blockers: CriticalBlocker[] = []

  // Group by rule ID
  const ruleGroups = new Map<string, PrioritizedIssue[]>()
  issues.forEach((issue) => {
    if (!ruleGroups.has(issue.ruleId)) {
      ruleGroups.set(issue.ruleId, [])
    }
    ruleGroups.get(issue.ruleId)!.push(issue)
  })

  ruleGroups.forEach((groupIssues, ruleId) => {
    // Critical blockers are:
    // 1. High impact (axe: critical/serious; ACE: violation/potentialviolation)
    // 2. WCAG Level A violations (legal requirement)
    const criticalIssues = groupIssues.filter((i) => impactRank(i.impact) >= 5)
    const levelAIssues = groupIssues.filter((i) => wcagLevelMatches(i.wcagLevel, 'A'))

    if (criticalIssues.length > 0 || levelAIssues.length > 0) {
      const firstIssue = groupIssues[0]
      blockers.push({
        ruleId,
        description: firstIssue.description,
        impact: firstIssue.impact,
        userImpact: firstIssue.userImpact,
        affectedElements: groupIssues.length,
        wcagLevel: (wcagLevelMatches(firstIssue.wcagLevel, 'A') || wcagLevelMatches(firstIssue.wcagLevel, 'AA') || wcagLevelMatches(firstIssue.wcagLevel, 'AAA'))
          ? firstIssue.wcagLevel
          : 'N/A',
      })
    }
  })

  // Sort by WCAG level (A first) and impact
  blockers.sort((a, b) => {
    const levelDiff = wcagLevelOrder(b.wcagLevel) - wcagLevelOrder(a.wcagLevel)
    if (levelDiff !== 0) return levelDiff
    return impactRank(b.impact) - impactRank(a.impact)
  })

  return blockers
}

/**
 * Generate reasoning for prioritization
 */
function generatePrioritizationReasoning(
  criteria: 'impact' | 'wcag' | 'fixability' | 'user-impact',
  prioritized: PrioritizedIssue[],
  quickWins: QuickWin[],
  blockers: CriticalBlocker[]
): string {
  const parts: string[] = []

  parts.push(`Prioritized ${prioritized.length} issues using "${criteria}" criteria.`)

  if (blockers.length > 0) {
    parts.push(`\n🚨 Found ${blockers.length} critical blocker(s) that must be fixed before launch.`)
    parts.push(`These are WCAG Level A violations or high-impact issues (e.g. axe critical/serious, ACE violation) that prevent users with disabilities from accessing content.`)
  }

  if (quickWins.length > 0) {
    parts.push(`\n✨ Identified ${quickWins.length} quick win(s) - easy fixes with high impact.`)
    parts.push(`These issues can be fixed quickly and will significantly improve accessibility.`)
  }

  // Breakdown by impact (axe/ACE native levels)
  const impactCounts: Record<string, number> = {}
  prioritized.forEach((issue) => {
    impactCounts[issue.impact] = (impactCounts[issue.impact] || 0) + 1
  })
  const impactEntries = Object.entries(impactCounts).sort(
    (a, b) => impactRank(b[0]) - impactRank(a[0])
  )
  impactEntries.forEach(([level, count]) => {
    const icon = impactRank(level) >= 5 ? '🚫' : impactRank(level) >= 4 ? '⚠️' : 'ℹ️'
    parts.push(`\n${icon} ${level}: ${count}`)
  })

  // Explain the criteria used
  switch (criteria) {
    case 'impact':
      parts.push(`\nIssues are sorted by impact level (axe: critical/serious/moderate/minor; ACE: violation/potentialviolation/...).`)
      break
    case 'wcag':
      parts.push(`\nIssues are sorted by WCAG compliance level (Level A violations first, as they are legal requirements).`)
      break
    case 'fixability':
      parts.push(`\nIssues are sorted by fixability (issues with clear fix suggestions first).`)
      break
    case 'user-impact':
      parts.push(`\nIssues are sorted by user impact, prioritizing issues that most affect users with disabilities.`)
      break
  }

  return parts.join('\n')
}

/**
 * prioritize_issues - Smart prioritization with quick wins and critical blockers
 * 
 * Intelligently prioritizes accessibility issues based on specified criteria,
 * identifying quick wins (easy fixes with high impact) and critical blockers
 * (must fix before launch).
 * 
 * @param input - Prioritization input (results, criteria, limit)
 * @returns Prioritized issues with quick wins, critical blockers, and reasoning
 */
export function prioritizeIssues(
  input: PrioritizeIssuesInput
): PrioritizeIssuesResult {
  const {
    results,
    criteria = 'impact',
    limit,
  } = input

  // Normalize: accept single result or placeholder from external tools (e.g. CodeMie)
  const auditResult = Array.isArray(results) ? results[0] : results
  const prioritizedIssues = Array.isArray(auditResult?.prioritizedIssues)
    ? auditResult.prioritizedIssues
    : []

  // Prioritize issues by criteria
  let prioritized = prioritizeByCriteria(prioritizedIssues, criteria)

  // Apply limit if specified
  if (limit && limit > 0) {
    prioritized = prioritized.slice(0, limit)
  }

  // Identify quick wins
  const quickWins = identifyQuickWins(prioritizedIssues)

  // Identify critical blockers
  const criticalBlockers = identifyCriticalBlockers(prioritizedIssues)

  // Generate reasoning
  const reasoning = generatePrioritizationReasoning(
    criteria,
    prioritized,
    quickWins,
    criticalBlockers
  )

  return {
    prioritized,
    quickWins,
    criticalBlockers,
    reasoning,
  }
}

/**
 * Knowledge base for accessibility rule explanations
 * Maps rule IDs to comprehensive explanations with code examples
 */
const RULE_EXPLANATIONS: Record<
  string,
  Omit<IssueExplanation, 'ruleId'>
> = {
  alt_missing: {
    explanation:
      'Images without alternative text cannot be understood by screen readers. When an image is decorative or informational, it needs an alt attribute that describes its content or purpose.',
    userImpact:
      'Users who are blind or have low vision rely on screen readers to understand images. Without alt text, they miss important visual information, making the content inaccessible.',
    howToFix:
      'Add an alt attribute to all <img> elements. For informative images, describe what the image shows. For decorative images, use an empty alt attribute (alt="").',
    wcagReference: 'WCAG 2.1 Success Criterion 1.1.1 (Level A): Non-text Content',
    commonMistakes: [
      'Using generic alt text like "image" or "photo"',
      'Including "image of" or "picture of" in alt text (redundant)',
      'Using alt text for decorative images instead of alt=""',
      'Missing alt attribute entirely',
      'Using the filename as alt text',
    ],
    codeExample: {
      before: '<img src="logo.png">',
      after: '<img src="logo.png" alt="Company Logo">',
    },
  },
  alt_link_missing: {
    explanation:
      'Linked images without alternative text create navigation barriers. Screen reader users cannot determine where the link goes without descriptive alt text.',
    userImpact:
      'Screen reader users hear "link" without context, making it impossible to understand the link purpose or destination. This prevents effective navigation.',
    howToFix:
      'Add descriptive alt text to images that are links. The alt text should describe the link destination or action, not just the image content.',
    wcagReference: 'WCAG 2.1 Success Criterion 1.1.1 (Level A): Non-text Content',
    commonMistakes: [
      'Using alt text that describes the image instead of the link purpose',
      'Leaving alt text empty for linked images',
      'Using the same alt text for multiple links',
      'Including "link to" in alt text (redundant)',
    ],
    codeExample: {
      before: '<a href="/products"><img src="products-icon.png"></a>',
      after: '<a href="/products"><img src="products-icon.png" alt="View our products">',
    },
  },
  label_missing: {
    explanation:
      'Form inputs without labels cannot be properly identified by assistive technologies. Labels provide essential context about what information is expected.',
    userImpact:
      'Screen reader users cannot determine what information to enter in form fields. This makes forms completely unusable for users with disabilities.',
    howToFix:
      'Associate a <label> element with each form input using the "for" attribute matching the input "id", or wrap the input inside the label element.',
    wcagReference: 'WCAG 2.1 Success Criterion 1.3.1 (Level A): Info and Relationships',
    commonMistakes: [
      'Using placeholder text instead of labels',
      'Using only visual labels without proper label association',
      'Mismatching label "for" and input "id" attributes',
      'Using aria-label instead of proper label elements',
    ],
    codeExample: {
      before: '<input type="text" id="email">',
      after: '<label for="email">Email Address</label><input type="text" id="email" name="email">',
    },
  },
  label_empty: {
    explanation:
      'Empty label elements provide no information to assistive technology users. Labels must contain descriptive text that explains the form field purpose.',
    userImpact:
      'Screen reader users hear "label" but receive no information about what to enter, making the form field unusable.',
    howToFix:
      'Add descriptive text content to label elements that clearly indicates what information is expected in the associated form field.',
    wcagReference: 'WCAG 2.1 Success Criterion 1.3.1 (Level A): Info and Relationships',
    commonMistakes: [
      'Leaving label text empty',
      'Using only symbols or icons without text',
      'Using placeholder text as a substitute for label text',
    ],
    codeExample: {
      before: '<label for="phone"></label><input type="tel" id="phone">',
      after: '<label for="phone">Phone Number</label><input type="tel" id="phone" name="phone">',
    },
  },
  contrast: {
    explanation:
      'Insufficient color contrast between text and background makes content difficult or impossible to read for users with low vision or color blindness.',
    userImpact:
      'Users with low vision, color blindness, or those viewing content in bright sunlight cannot read text with poor contrast. This affects readability and usability.',
    howToFix:
      'Ensure text has a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text (18pt+ or 14pt+ bold) against the background. Use contrast checking tools to verify.',
    wcagReference: 'WCAG 2.1 Success Criterion 1.4.3 (Level AA): Contrast (Minimum)',
    commonMistakes: [
      'Using light gray text on white backgrounds',
      'Using colored text without sufficient contrast',
      'Assuming color alone conveys information',
      'Not testing contrast in different lighting conditions',
    ],
    codeExample: {
      before: '<p style="color: #cccccc; background: white;">Low contrast text</p>',
      after: '<p style="color: #333333; background: white;">High contrast text</p>',
    },
  },
  heading_empty: {
    explanation:
      'Empty heading elements break document structure and confuse screen reader users. Headings should contain meaningful text that describes the section content.',
    userImpact:
      'Screen reader users rely on headings to navigate and understand page structure. Empty headings create confusion and make navigation difficult.',
    howToFix:
      'Add descriptive text content to all heading elements (h1-h6). Ensure headings follow a logical hierarchy without skipping levels.',
    wcagReference: 'WCAG 2.1 Success Criterion 1.3.1 (Level A): Info and Relationships',
    commonMistakes: [
      'Using empty headings for spacing',
      'Skipping heading levels (e.g., h1 to h3)',
      'Using headings purely for styling instead of structure',
      'Hiding heading text with CSS instead of removing empty headings',
    ],
    codeExample: {
      before: '<h2></h2><p>Content here</p>',
      after: '<h2>Section Title</h2><p>Content here</p>',
    },
  },
  link_empty: {
    explanation:
      'Links without text content cannot be understood by screen reader users. Empty links or links with only images without alt text provide no context.',
    userImpact:
      'Screen reader users hear "link" without any information about where it goes or what it does, making navigation impossible.',
    howToFix:
      'Add descriptive text content to all links. If a link contains only an image, ensure the image has descriptive alt text that explains the link purpose.',
    wcagReference: 'WCAG 2.1 Success Criterion 2.4.4 (Level A): Link Purpose (In Context)',
    commonMistakes: [
      'Using empty links for JavaScript actions',
      'Using only icons without text or alt text',
      'Using generic text like "click here" or "read more"',
      'Using the URL as link text',
    ],
    codeExample: {
      before: '<a href="/about"></a>',
      after: '<a href="/about">Learn more about us</a>',
    },
  },
  language_missing: {
    explanation:
      'Pages without a declared language make it difficult for screen readers to pronounce content correctly. The language should be specified in the HTML lang attribute.',
    userImpact:
      'Screen readers may mispronounce words, making content difficult to understand. Users who rely on translation tools cannot properly translate the page.',
    howToFix:
      'Add a lang attribute to the <html> element specifying the primary language of the page (e.g., lang="en" for English).',
    wcagReference: 'WCAG 2.1 Success Criterion 3.1.1 (Level A): Language of Page',
    commonMistakes: [
      'Missing lang attribute on html element',
      'Using incorrect language codes',
      'Not updating lang attribute for pages in different languages',
      'Using lang attribute only on body instead of html',
    ],
    codeExample: {
      before: '<html><head>...</head><body>...</body></html>',
      after: '<html lang="en"><head>...</head><body>...</body></html>',
    },
  },
  aria_reference_broken: {
    explanation:
      'ARIA attributes that reference other elements (like aria-labelledby or aria-describedby) point to non-existent elements, breaking the accessibility relationship.',
    userImpact:
      'Screen reader users miss important information because ARIA relationships are broken. This can make interactive elements unusable.',
    howToFix:
      'Ensure all ARIA reference attributes (aria-labelledby, aria-describedby, aria-controls, etc.) point to existing element IDs on the page.',
    wcagReference: 'WCAG 2.1 Success Criterion 4.1.2 (Level A): Name, Role, Value',
    commonMistakes: [
      'Referencing IDs that do not exist',
      'Using duplicate IDs on the page',
      'Referencing elements that are hidden or removed',
      'Typos in ID references',
    ],
    codeExample: {
      before: '<button aria-labelledby="nonexistent">Submit</button>',
      after: '<span id="submit-label">Submit Form</span><button aria-labelledby="submit-label">Submit</button>',
    },
  },
  keyboard: {
    explanation:
      'Interactive elements that cannot be accessed via keyboard exclude users who cannot use a mouse. All functionality must be keyboard accessible.',
    userImpact:
      'Users who rely on keyboard navigation cannot access interactive elements, making parts of the website completely unusable for them.',
    howToFix:
      'Ensure all interactive elements (buttons, links, form controls) are keyboard accessible. Add proper focus indicators and ensure keyboard event handlers work correctly.',
    wcagReference: 'WCAG 2.1 Success Criterion 2.1.1 (Level A): Keyboard',
    commonMistakes: [
      'Using div or span with click handlers instead of buttons',
      'Removing default keyboard functionality',
      'Not providing visible focus indicators',
      'Creating keyboard traps that prevent navigation',
    ],
    codeExample: {
      before: '<div onclick="submitForm()">Submit</div>',
      after: '<button type="button" onclick="submitForm()">Submit</button>',
    },
  },
  focus_order: {
    explanation:
      'Focus order that does not follow a logical sequence confuses keyboard users. Focus should move in an order that preserves meaning and operability.',
    userImpact:
      'Keyboard users expect focus to move logically through the page. Illogical focus order makes navigation confusing and frustrating.',
    howToFix:
      'Ensure focus order follows the visual reading order. Use tabindex sparingly and only when necessary to fix focus order issues.',
    wcagReference: 'WCAG 2.1 Success Criterion 2.4.3 (Level A): Focus Order',
    commonMistakes: [
      'Using positive tabindex values that disrupt natural order',
      'Focus jumping to off-screen or hidden elements',
      'Focus order not matching visual layout',
      'Focus moving to elements that are not interactive',
    ],
    codeExample: {
      before: '<input tabindex="3"><input tabindex="1"><input tabindex="2">',
      after: '<input><input><input>',
    },
  },
}

/**
 * Get explanation for an accessibility rule, with fallback for unknown rules
 */
function getRuleExplanation(
  ruleId: string,
  context?: string
): Omit<IssueExplanation, 'ruleId'> {
  const explanation = RULE_EXPLANATIONS[ruleId]

  if (explanation) {
    // Enhance explanation with context if provided
    if (context) {
      return {
        ...explanation,
        explanation: `${explanation.explanation}\n\nAdditional context: ${context}`,
      }
    }
    return explanation
  }

  // Fallback for unknown rules
  return {
    explanation: `This accessibility issue (${ruleId}) indicates a violation that may impact users with disabilities. While we don't have detailed information about this specific rule, it's important to address it to ensure accessibility.`,
    userImpact:
      'This issue may prevent users with disabilities from accessing or understanding content. The specific impact depends on the nature of the violation.',
    howToFix: `Review the accessibility documentation for ${ruleId} to understand the specific requirements and how to fix this issue.`,
    wcagReference: 'WCAG 2.1 Guidelines - See accessibility documentation for specific criterion',
    commonMistakes: [
      'Not addressing the issue',
      'Implementing a partial fix',
      'Not testing the fix with assistive technologies',
    ],
    codeExample: context
      ? {
          before: context,
          after: 'Review accessibility documentation for the correct implementation',
        }
      : undefined,
  }
}

/**
 * explain_issue - Educational tool that explains accessibility issues
 * 
 * Provides comprehensive explanations of accessibility rules in plain language,
 * including why they matter, how to fix them, and common mistakes to avoid.
 * 
 * @param input - Explanation input (ruleId, optional context)
 * @returns Detailed explanation with code examples and WCAG references
 */
export function explainIssue(
  input: ExplainIssueInput
): IssueExplanation {
  const { ruleId, context } = input

  if (!ruleId || ruleId.trim().length === 0) {
    throw new Error('ruleId is required')
  }

  const explanation = getRuleExplanation(ruleId, context)

  return {
    ruleId,
    ...explanation,
  }
}

/**
 * Format quick fix as markdown
 */
function formatFixAsMarkdown(fix: QuickFixItem): string {
  const parts: string[] = []

  parts.push(`## ${fix.description}`)
  parts.push(`\n**Rule ID:** ${fix.ruleId}`)
  parts.push(`\n**Impact:** ${fix.impactEstimate}`)
  parts.push(`\n**Affected Elements:** ${fix.affectedElements}`)
  parts.push(`\n\n### Explanation`)
  parts.push(`\n${fix.explanation}`)

  if (fix.currentCode && fix.fixedCode) {
    parts.push(`\n\n### Code Fix`)
    parts.push(`\n**Before:**`)
    parts.push(`\n\`\`\`html`)
    parts.push(`\n${fix.currentCode}`)
    parts.push(`\n\`\`\``)
    parts.push(`\n\n**After:**`)
    parts.push(`\n\`\`\`html`)
    parts.push(`\n${fix.fixedCode}`)
    parts.push(`\n\`\`\``)
  }

  return parts.join('')
}

/**
 * Format quick fix as HTML
 */
function formatFixAsHTML(fix: QuickFixItem): string {
  const parts: string[] = []

  parts.push(`<div class="quick-fix">`)
  parts.push(`<h2>${fix.description}</h2>`)
  parts.push(`<p><strong>Rule ID:</strong> ${fix.ruleId}</p>`)
  parts.push(`<p><strong>Impact:</strong> ${fix.impactEstimate}</p>`)
  parts.push(`<p><strong>Affected Elements:</strong> ${fix.affectedElements}</p>`)
  parts.push(`<h3>Explanation</h3>`)
  parts.push(`<p>${fix.explanation}</p>`)

  if (fix.currentCode && fix.fixedCode) {
    parts.push(`<h3>Code Fix</h3>`)
    parts.push(`<h4>Before:</h4>`)
    parts.push(`<pre><code>${escapeHtml(fix.currentCode)}</code></pre>`)
    parts.push(`<h4>After:</h4>`)
    parts.push(`<pre><code>${escapeHtml(fix.fixedCode)}</code></pre>`)
  }

  parts.push(`</div>`)

  return parts.join('')
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Convert prioritized issues to quick fix items
 */
function issuesToQuickFixes(
  issues: PrioritizedIssue[],
  includeCode: boolean
): QuickFixItem[] {
  // Group issues by rule ID to show fixes once per rule type
  const ruleGroups = new Map<string, PrioritizedIssue[]>()
  issues.forEach((issue) => {
    if (!ruleGroups.has(issue.ruleId)) {
      ruleGroups.set(issue.ruleId, [])
    }
    ruleGroups.get(issue.ruleId)!.push(issue)
  })

  const quickFixes: QuickFixItem[] = []

  ruleGroups.forEach((groupIssues, ruleId) => {
    const firstIssue = groupIssues[0]
    const r = impactRank(firstIssue.impact)
    const impactEstimate =
      r >= 5
        ? 'Critical - Must fix immediately'
        : r >= 4
          ? 'Serious - High priority'
          : r >= 3
            ? 'Moderate - Should fix soon'
            : 'Minor - Consider fixing'

    quickFixes.push({
      ruleId,
      description: firstIssue.description,
      currentCode: includeCode ? firstIssue.fix.current : undefined,
      fixedCode: includeCode ? firstIssue.fix.suggested : undefined,
      explanation: firstIssue.fix.explanation || firstIssue.userImpact,
      impactEstimate,
      affectedElements: groupIssues.length,
    })
  })

  // Sort by impact (critical first)
  const estimateRank = (e: string) =>
    e === 'Critical - Must fix immediately' ? 4 : e === 'Serious - High priority' ? 3 : e === 'Moderate - Should fix soon' ? 2 : 1
  quickFixes.sort((a, b) => estimateRank(b.impactEstimate) - estimateRank(a.impactEstimate))

  return quickFixes
}

/**
 * get_quick_fixes - Generate actionable fixes with before/after code examples
 * 
 * Extracts actionable fix suggestions from audit results and formats them
 * in the requested format (markdown, HTML, or JSON) with before/after code examples.
 * 
 * @param input - Quick fixes input (results or URL, format, includeCode)
 * @returns Formatted quick fixes with code examples
 */
export async function getQuickFixes(
  input: QuickFixesInput
): Promise<QuickFixesResult> {
  const {
    results,
    format = 'json',
    includeCode = true,
  } = input

  let auditResult: AuditResult

  // If input is a URL string, run an audit first
  if (typeof results === 'string') {
    auditResult = await auditUrl({
      url: results,
    })
  } else {
    auditResult = results
  }

  // Convert issues to quick fixes
  const fixes = issuesToQuickFixes(
    auditResult.prioritizedIssues,
    includeCode
  )

  // Format fixes based on requested format
  if (format === 'markdown') {
    const markdownContent = fixes.map(formatFixAsMarkdown).join('\n\n---\n\n')
    return {
      fixes,
      format,
      totalFixes: fixes.length,
      formatted: markdownContent,
    }
  } else if (format === 'html') {
    const htmlContent = fixes.map(formatFixAsHTML).join('\n\n')
    return {
      fixes,
      format,
      totalFixes: fixes.length,
      formatted: `<div class="quick-fixes">\n${htmlContent}\n</div>`,
    }
  }

  // Return structured data (JSON format)
  return {
    fixes,
    format,
    totalFixes: fixes.length,
  }
}

/**
 * WCAG 2.1 Success Criteria mapping
 * Maps accessibility rule IDs to WCAG 2.1 success criteria
 */
const WCAG_CRITERIA_MAPPING: Record<string, { criterion: string; title: string; level: WCAGLevel }> = {
  // Level A criteria
  alt_missing: { criterion: '1.1.1', title: 'Non-text Content', level: 'A' },
  alt_link_missing: { criterion: '1.1.1', title: 'Non-text Content', level: 'A' },
  label_missing: { criterion: '1.3.1', title: 'Info and Relationships', level: 'A' },
  label_empty: { criterion: '1.3.1', title: 'Info and Relationships', level: 'A' },
  heading_empty: { criterion: '1.3.1', title: 'Info and Relationships', level: 'A' },
  language_missing: { criterion: '3.1.1', title: 'Language of Page', level: 'A' },
  link_empty: { criterion: '2.4.4', title: 'Link Purpose (In Context)', level: 'A' },
  link_skip_broken: { criterion: '2.4.1', title: 'Bypass Blocks', level: 'A' },
  aria_reference_broken: { criterion: '4.1.2', title: 'Name, Role, Value', level: 'A' },
  aria_hidden: { criterion: '4.1.2', title: 'Name, Role, Value', level: 'A' },
  keyboard: { criterion: '2.1.1', title: 'Keyboard', level: 'A' },
  focus_order: { criterion: '2.4.3', title: 'Focus Order', level: 'A' },
  focus_visible: { criterion: '2.4.7', title: 'Focus Visible', level: 'AA' },
  // Level AA criteria
  contrast: { criterion: '1.4.3', title: 'Contrast (Minimum)', level: 'AA' },
  resize_text: { criterion: '1.4.4', title: 'Resize Text', level: 'AA' },
  // Level AAA criteria (less common)
  contrast_enhanced: { criterion: '1.4.6', title: 'Contrast (Enhanced)', level: 'AAA' },
}

/**
 * Get WCAG criterion for a rule ID
 */
function getWCAGCriterion(ruleId: string): { criterion: string; title: string; level: WCAGLevel } | null {
  return WCAG_CRITERIA_MAPPING[ruleId] || null
}

/**
 * Group issues by WCAG criterion
 */
function groupIssuesByCriterion(issues: PrioritizedIssue[]): Map<string, PrioritizedIssue[]> {
  const criterionMap = new Map<string, PrioritizedIssue[]>()

  issues.forEach((issue) => {
    const criterionInfo = getWCAGCriterion(issue.ruleId)
    if (criterionInfo) {
      const key = `${criterionInfo.criterion}-${criterionInfo.level}`
      if (!criterionMap.has(key)) {
        criterionMap.set(key, [])
      }
      criterionMap.get(key)!.push(issue)
    } else {
      // If no mapping found, use rule ID as fallback
      const fallbackKey = `unknown-${issue.ruleId}`
      if (!criterionMap.has(fallbackKey)) {
        criterionMap.set(fallbackKey, [])
      }
      criterionMap.get(fallbackKey)!.push(issue)
    }
  })

  return criterionMap
}

/**
 * Calculate compliance status for a criterion
 */
function calculateCriterionStatus(violations: PrioritizedIssue[]): ComplianceStatus {
  if (violations.length === 0) {
    return 'pass'
  }

  // If all violations are low impact, consider it partial compliance
  const allLowImpact = violations.every((v) => impactRank(v.impact) <= 2)
  if (allLowImpact) {
    return 'partial'
  }

  // If there are high-impact violations (axe: critical/serious; ACE: violation/potentialviolation), it's a fail
  const hasCriticalOrSerious = violations.some((v) => impactRank(v.impact) >= 5)
  if (hasCriticalOrSerious) {
    return 'fail'
  }

  return 'partial'
}

/**
 * Format compliance report as VPAT
 */
function formatVPATReport(
  level: WCAGLevel,
  wcagMapping: Record<string, ComplianceStatus>,
  compliancePercentage: number,
  remediationPlan?: QuickFixItem[]
): string {
  const parts: string[] = []

  parts.push('# Voluntary Product Accessibility Template (VPAT)')
  parts.push(`\n## WCAG ${level} Compliance Report`)
  parts.push(`\n**Compliance Percentage:** ${compliancePercentage}%`)
  parts.push(`\n**Report Date:** ${new Date().toISOString().split('T')[0]}`)

  parts.push(`\n## Summary Table`)
  parts.push(`\n| Criterion | Level | Status | Notes |`)
  parts.push(`|-----------|-------|--------|-------|`)

  Object.entries(wcagMapping)
    .sort(([a], [b]) => {
      const aNum = parseFloat(a.split('.')[0] + '.' + a.split('.')[1])
      const bNum = parseFloat(b.split('.')[0] + '.' + b.split('.')[1])
      return aNum - bNum
    })
    .forEach(([criterion, status]) => {
      const statusEmoji = status === 'pass' ? '✅' : status === 'partial' ? '⚠️' : '❌'
      parts.push(`| ${criterion} | ${level} | ${statusEmoji} ${status} | ${status === 'pass' ? 'Meets requirement' : 'Needs remediation'} |`)
    })

  if (remediationPlan && remediationPlan.length > 0) {
    parts.push(`\n## Remediation Plan`)
    remediationPlan.forEach((fix, index) => {
      parts.push(`\n### ${index + 1}. ${fix.description}`)
      parts.push(`- **Rule ID:** ${fix.ruleId}`)
      parts.push(`- **Impact:** ${fix.impactEstimate}`)
      parts.push(`- **Affected Elements:** ${fix.affectedElements}`)
      parts.push(`- **Explanation:** ${fix.explanation}`)
      if (fix.fixedCode) {
        parts.push(`- **Fix:** See code example below`)
      }
    })
  }

  return parts.join('\n')
}

/**
 * Format compliance report as WCAG
 */
function formatWCAGReport(
  level: WCAGLevel,
  wcagMapping: Record<string, ComplianceStatus>,
  compliancePercentage: number,
  remediationPlan?: QuickFixItem[]
): string {
  const parts: string[] = []

  parts.push('# WCAG 2.1 Compliance Report')
  parts.push(`\n## Level ${level} Compliance Assessment`)
  parts.push(`\n**Overall Compliance:** ${compliancePercentage}%`)
  parts.push(`\n**Assessment Date:** ${new Date().toISOString().split('T')[0]}`)

  parts.push(`\n## Success Criteria Status`)
  parts.push(`\n| Criterion | Title | Status |`)
  parts.push(`|----------|-------|--------|`)

  Object.entries(wcagMapping)
    .sort(([a], [b]) => {
      const aNum = parseFloat(a.split('.')[0] + '.' + a.split('.')[1])
      const bNum = parseFloat(b.split('.')[0] + '.' + b.split('.')[1])
      return aNum - bNum
    })
    .forEach(([criterion, status]) => {
      const criterionInfo = Object.values(WCAG_CRITERIA_MAPPING).find(
        (c) => c.criterion === criterion && c.level === level
      )
      const title = criterionInfo?.title || 'Unknown'
      const statusEmoji = status === 'pass' ? '✅' : status === 'partial' ? '⚠️' : '❌'
      parts.push(`| ${criterion} | ${title} | ${statusEmoji} ${status} |`)
    })

  if (remediationPlan && remediationPlan.length > 0) {
    parts.push(`\n## Recommended Remediation`)
    remediationPlan.forEach((fix, index) => {
      parts.push(`\n### ${index + 1}. ${fix.description}`)
      parts.push(`- **Impact:** ${fix.impactEstimate}`)
      parts.push(`- **Affected Elements:** ${fix.affectedElements}`)
      parts.push(`- **Remediation:** ${fix.explanation}`)
    })
  }

  return parts.join('\n')
}

/**
 * Format compliance report as ADA
 */
function formatADAReport(
  level: WCAGLevel,
  wcagMapping: Record<string, ComplianceStatus>,
  compliancePercentage: number,
  remediationPlan?: QuickFixItem[]
): string {
  const parts: string[] = []

  parts.push('# Americans with Disabilities Act (ADA) Compliance Report')
  parts.push(`\n## Web Content Accessibility Assessment`)
  parts.push(`\n**Compliance Level:** WCAG ${level}`)
  parts.push(`\n**Compliance Percentage:** ${compliancePercentage}%`)
  parts.push(`\n**Assessment Date:** ${new Date().toISOString().split('T')[0]}`)

  parts.push(`\n## Compliance Status`)
  const passCount = Object.values(wcagMapping).filter((s) => s === 'pass').length
  const partialCount = Object.values(wcagMapping).filter((s) => s === 'partial').length
  const failCount = Object.values(wcagMapping).filter((s) => s === 'fail').length
  const totalCriteria = Object.keys(wcagMapping).length

  parts.push(`\n- **Total Criteria Assessed:** ${totalCriteria}`)
  parts.push(`- **Fully Compliant:** ${passCount} (${Math.round((passCount / totalCriteria) * 100)}%)`)
  parts.push(`- **Partially Compliant:** ${partialCount} (${Math.round((partialCount / totalCriteria) * 100)}%)`)
  parts.push(`- **Non-Compliant:** ${failCount} (${Math.round((failCount / totalCriteria) * 100)}%)`)

  parts.push(`\n## Detailed Findings`)
  Object.entries(wcagMapping)
    .sort(([a], [b]) => {
      const aNum = parseFloat(a.split('.')[0] + '.' + a.split('.')[1])
      const bNum = parseFloat(b.split('.')[0] + '.' + b.split('.')[1])
      return aNum - bNum
    })
    .forEach(([criterion, status]) => {
      const criterionInfo = Object.values(WCAG_CRITERIA_MAPPING).find(
        (c) => c.criterion === criterion && c.level === level
      )
      const title = criterionInfo?.title || 'Unknown'
      const statusText = status === 'pass' ? 'Compliant' : status === 'partial' ? 'Partially Compliant' : 'Non-Compliant'
      parts.push(`\n### ${criterion} - ${title}`)
      parts.push(`**Status:** ${statusText}`)
    })

  if (remediationPlan && remediationPlan.length > 0) {
    parts.push(`\n## Remediation Recommendations`)
    remediationPlan.forEach((fix, index) => {
      parts.push(`\n${index + 1}. **${fix.description}**`)
      parts.push(`   - Impact: ${fix.impactEstimate}`)
      parts.push(`   - Affected Elements: ${fix.affectedElements}`)
      parts.push(`   - Recommendation: ${fix.explanation}`)
    })
  }

  return parts.join('\n')
}

/**
 * Format compliance report as Section 508
 */
function formatSection508Report(
  level: WCAGLevel,
  wcagMapping: Record<string, ComplianceStatus>,
  compliancePercentage: number,
  remediationPlan?: QuickFixItem[]
): string {
  const parts: string[] = []

  parts.push('# Section 508 Compliance Report')
  parts.push(`\n## Information and Communication Technology (ICT) Accessibility Assessment`)
  parts.push(`\n**WCAG Level:** ${level}`)
  parts.push(`\n**Compliance Percentage:** ${compliancePercentage}%`)
  parts.push(`\n**Assessment Date:** ${new Date().toISOString().split('T')[0]}`)

  parts.push(`\n## Section 508 Standards Compliance`)
  parts.push(`\nSection 508 requires compliance with WCAG ${level} Level standards.`)
  parts.push(`\n**Overall Compliance:** ${compliancePercentage}%`)

  parts.push(`\n## WCAG Success Criteria Status`)
  parts.push(`\n| Criterion | Status |`)
  parts.push(`|-----------|--------|`)

  Object.entries(wcagMapping)
    .sort(([a], [b]) => {
      const aNum = parseFloat(a.split('.')[0] + '.' + a.split('.')[1])
      const bNum = parseFloat(b.split('.')[0] + '.' + b.split('.')[1])
      return aNum - bNum
    })
    .forEach(([criterion, status]) => {
      const statusText = status === 'pass' ? 'Compliant' : status === 'partial' ? 'Partially Compliant' : 'Non-Compliant'
      parts.push(`| ${criterion} | ${statusText} |`)
    })

  if (remediationPlan && remediationPlan.length > 0) {
    parts.push(`\n## Corrective Action Plan`)
    remediationPlan.forEach((fix, index) => {
      parts.push(`\n### Corrective Action ${index + 1}`)
      parts.push(`- **Issue:** ${fix.description}`)
      parts.push(`- **Severity:** ${fix.impactEstimate}`)
      parts.push(`- **Affected Elements:** ${fix.affectedElements}`)
      parts.push(`- **Corrective Action:** ${fix.explanation}`)
    })
  }

  return parts.join('\n')
}

/**
 * Generate executive summary for compliance report
 */
function generateExecutiveSummary(
  format: ComplianceReportFormat,
  level: WCAGLevel,
  compliancePercentage: number,
  totalIssues: number,
  wcagMapping: Record<string, ComplianceStatus>
): string {
  const passCount = Object.values(wcagMapping).filter((s) => s === 'pass').length
  const failCount = Object.values(wcagMapping).filter((s) => s === 'fail').length
  const partialCount = Object.values(wcagMapping).filter((s) => s === 'partial').length
  const totalCriteria = Object.keys(wcagMapping).length

  const parts: string[] = []

  parts.push(`This ${format} compliance report assesses the accessibility of the web content against WCAG 2.1 Level ${level} standards.`)
  parts.push(`\n\n**Key Findings:**`)
  parts.push(`- Overall compliance: ${compliancePercentage}%`)
  parts.push(`- Total accessibility issues found: ${totalIssues}`)
  parts.push(`- Criteria assessed: ${totalCriteria}`)
  parts.push(`- Fully compliant criteria: ${passCount}`)
  parts.push(`- Partially compliant criteria: ${partialCount}`)
  parts.push(`- Non-compliant criteria: ${failCount}`)

  if (compliancePercentage >= 95) {
    parts.push(`\n\nThe content demonstrates strong compliance with WCAG ${level} standards.`)
  } else if (compliancePercentage >= 80) {
    parts.push(`\n\nThe content shows good compliance but requires some improvements to fully meet WCAG ${level} standards.`)
  } else if (compliancePercentage >= 60) {
    parts.push(`\n\nThe content needs significant improvements to meet WCAG ${level} compliance requirements.`)
  } else {
    parts.push(`\n\nThe content requires substantial remediation to achieve WCAG ${level} compliance.`)
  }

  return parts.join('')
}

/**
 * generate_compliance_report - Generate VPAT/WCAG/ADA compliance reports
 * 
 * Generates compliance reports in various formats (VPAT, WCAG, ADA, Section 508)
 * with WCAG criterion mapping, compliance percentages, and optional remediation plans.
 * 
 * @param input - Compliance report input (results, format, level, includeRemediation)
 * @returns Formatted compliance report with executive summary and WCAG mapping
 */
export function generateComplianceReport(
  input: GenerateComplianceReportInput
): ComplianceReport {
  const {
    results,
    format = 'WCAG',
    level = 'AA',
    includeRemediation = false,
  } = input

  // Normalize: accept single result or array (e.g. from external tools like CodeMie)
  const auditResult = Array.isArray(results) ? results[0] : results
  if (auditResult == null || typeof auditResult !== 'object') {
    throw new Error('Invalid results: expected an audit result object (or array with one result).')
  }
  const prioritizedIssues = Array.isArray((auditResult as AuditResult).prioritizedIssues)
    ? (auditResult as AuditResult).prioritizedIssues
    : []

  // Group issues by WCAG criterion
  const criterionMap = groupIssuesByCriterion(prioritizedIssues)

  // Build WCAG mapping
  const wcagMapping: Record<string, ComplianceStatus> = {}
  const criteria: WCAGCriterion[] = []

  criterionMap.forEach((violations, key) => {
    const [criterion, criterionLevel] = key.split('-')
    
    // Only include criteria for the requested level and below
    const levelOrder: Record<WCAGLevel, number> = { A: 1, AA: 2, AAA: 3 }
    const requestedLevelOrder = levelOrder[level]
    const violationLevelOrder = levelOrder[criterionLevel as WCAGLevel] || 0
    
    if (violationLevelOrder <= requestedLevelOrder && criterionLevel === level) {
      const status = calculateCriterionStatus(violations)
      wcagMapping[criterion] = status

      const criterionInfo = Object.values(WCAG_CRITERIA_MAPPING).find(
        (c) => c.criterion === criterion && c.level === level
      )

      criteria.push({
        criterion,
        title: criterionInfo?.title || 'Unknown',
        level: level,
        status,
        violations,
      })
    }
  })

  // Calculate compliance percentage
  const totalCriteria = Object.keys(wcagMapping).length
  const passCount = Object.values(wcagMapping).filter((s) => s === 'pass').length
  const compliancePercentage = totalCriteria > 0
    ? Math.round((passCount / totalCriteria) * 100)
    : 100

  // Generate remediation plan if requested
  let remediationPlan: QuickFixItem[] | undefined
  if (includeRemediation) {
    const quickFixesResult = issuesToQuickFixes(prioritizedIssues, true)
    remediationPlan = quickFixesResult.slice(0, 20) // Top 20 fixes
  }

  // Generate executive summary (safe when summary is missing)
  const totalIssues = (auditResult as AuditResult).summary?.totalIssues ?? 0
  const executiveSummary = generateExecutiveSummary(
    format,
    level,
    compliancePercentage,
    totalIssues,
    wcagMapping
  )

  // Format report content based on format
  let reportContent: string
  switch (format) {
    case 'VPAT':
      reportContent = formatVPATReport(level, wcagMapping, compliancePercentage, remediationPlan)
      break
    case 'ADA':
      reportContent = formatADAReport(level, wcagMapping, compliancePercentage, remediationPlan)
      break
    case 'Section508':
      reportContent = formatSection508Report(level, wcagMapping, compliancePercentage, remediationPlan)
      break
    case 'WCAG':
    default:
      reportContent = formatWCAGReport(level, wcagMapping, compliancePercentage, remediationPlan)
      break
  }

  return {
    format,
    level,
    executiveSummary,
    wcagMapping,
    remediationPlan,
    compliancePercentage,
    reportContent,
  }
}

/**
 * get_wcag_compliance - Check WCAG compliance status with per-criterion breakdown
 * 
 * Analyzes audit results to determine WCAG compliance status at the specified level,
 * providing a detailed per-criterion breakdown with violations and missing requirements.
 * 
 * @param input - WCAG compliance input (results or URL, level)
 * @returns WCAG compliance result with per-criterion breakdown
 */
export async function getWCAGCompliance(
  input: WCAGComplianceInput
): Promise<WCAGComplianceResult> {
  let auditResult: AuditResult

  // If input is a URL string, run an audit first
  if (typeof input.results === 'string') {
    const { auditUrl } = await import('./audit.js')
    auditResult = await auditUrl({
      url: input.results,
    })
  } else {
    auditResult = input.results
  }

  const level = input.level || 'AA'

  // Group issues by WCAG criterion
  const criterionMap = groupIssuesByCriterion(auditResult.prioritizedIssues)

  // Build criteria breakdown
  const criteria: WCAGCriterion[] = []
  const missingRequirements: string[] = []

  // Get all WCAG criteria for the requested level
  const levelCriteria = Object.values(WCAG_CRITERIA_MAPPING).filter(
    (c) => {
      const levelOrder: Record<WCAGLevel, number> = { A: 1, AA: 2, AAA: 3 }
      const requestedLevelOrder = levelOrder[level]
      const criterionLevelOrder = levelOrder[c.level]
      return criterionLevelOrder <= requestedLevelOrder && c.level === level
    }
  )

  // Check each criterion
  levelCriteria.forEach((criterionInfo) => {
    const key = `${criterionInfo.criterion}-${criterionInfo.level}`
    const violations = criterionMap.get(key) || []

    const status = calculateCriterionStatus(violations)

    criteria.push({
      criterion: criterionInfo.criterion,
      title: criterionInfo.title,
      level: criterionInfo.level,
      status,
      violations,
    })

    if (status === 'fail') {
      missingRequirements.push(
        `${criterionInfo.criterion} - ${criterionInfo.title}: ${violations.length} violation(s) found`
      )
    } else if (status === 'partial') {
      missingRequirements.push(
        `${criterionInfo.criterion} - ${criterionInfo.title}: Partial compliance with ${violations.length} minor issue(s)`
      )
    }
  })

  // Also check for violations that don't map to known criteria
  criterionMap.forEach((violations, key) => {
    if (key.startsWith('unknown-')) {
      violations.forEach((violation) => {
        missingRequirements.push(
          `Unknown criterion - ${violation.ruleId}: ${violation.description}`
        )
      })
    }
  })

  // Calculate overall compliance status
  const totalCriteria = criteria.length
  const passCount = criteria.filter((c) => c.status === 'pass').length
  const compliancePercentage = totalCriteria > 0
    ? Math.round((passCount / totalCriteria) * 100)
    : 100

  // Determine overall status
  let status: ComplianceStatus
  if (compliancePercentage === 100) {
    status = 'pass'
  } else if (compliancePercentage >= 80) {
    status = 'partial'
  } else {
    status = 'fail'
  }

  // Generate summary
  const summaryParts: string[] = []
  summaryParts.push(`WCAG 2.1 Level ${level} Compliance: ${compliancePercentage}%`)
  summaryParts.push(`\n- Total criteria assessed: ${totalCriteria}`)
  summaryParts.push(`- Fully compliant: ${passCount}`)
  summaryParts.push(`- Partially compliant: ${criteria.filter((c) => c.status === 'partial').length}`)
  summaryParts.push(`- Non-compliant: ${criteria.filter((c) => c.status === 'fail').length}`)
  
  if (missingRequirements.length > 0) {
    summaryParts.push(`\nMissing or incomplete requirements: ${missingRequirements.length}`)
  }

  const summary = summaryParts.join('\n')

  return {
    level,
    status,
    compliancePercentage,
    criteria,
    missingRequirements,
    summary,
  }
}
