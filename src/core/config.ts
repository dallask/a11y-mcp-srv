/**
 * MCP server configuration from environment variables.
 * Compatible with joe-watkins/accessibility-testing-mcp style config.
 *
 * Configure via MCP config "env" section, e.g.:
 *   "env": {
 *     "A11Y_ENGINE": "axe",
 *     "WCAG_LEVEL": "2.2_AA",
 *     "BEST_PRACTICES": "true",
 *     "SCREEN_SIZES": "1280x1024,320x640",
 *     "HEADLESS_BROWSER": "true"
 *   }
 */

export type WcagLevel =
  | '2.0_A'
  | '2.0_AA'
  | '2.0_AAA'
  | '2.1_A'
  | '2.1_AA'
  | '2.1_AAA'
  | '2.2_A'
  | '2.2_AA'
  | '2.2_AAA'

export type A11yEngine = 'axe' | 'ace'

export interface ScreenSize {
  width: number
  height: number
  label: string
}

/** Mapping from WCAG level to axe-core tags (and ACE policy for future use) */
const WCAG_LEVEL_MAP: Record<
  WcagLevel,
  { axeTags: string[]; acePolicy: string }
> = {
  '2.0_A': { axeTags: ['wcag2a'], acePolicy: 'WCAG_2_0' },
  '2.0_AA': { axeTags: ['wcag2a', 'wcag2aa'], acePolicy: 'WCAG_2_0' },
  '2.0_AAA': {
    axeTags: ['wcag2a', 'wcag2aa', 'wcag2aaa'],
    acePolicy: 'WCAG_2_0',
  },
  '2.1_A': { axeTags: ['wcag2a', 'wcag21a'], acePolicy: 'WCAG_2_1' },
  '2.1_AA': {
    axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    acePolicy: 'WCAG_2_1',
  },
  '2.1_AAA': {
    axeTags: [
      'wcag2a',
      'wcag2aa',
      'wcag2aaa',
      'wcag21a',
      'wcag21aa',
      'wcag21aaa',
    ],
    acePolicy: 'WCAG_2_1',
  },
  '2.2_A': { axeTags: ['wcag2a', 'wcag21a', 'wcag22a'], acePolicy: 'WCAG_2_2' },
  '2.2_AA': {
    axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
    acePolicy: 'WCAG_2_2',
  },
  '2.2_AAA': {
    axeTags: [
      'wcag2a',
      'wcag2aa',
      'wcag2aaa',
      'wcag21a',
      'wcag21aa',
      'wcag21aaa',
      'wcag22a',
      'wcag22aa',
      'wcag22aaa',
    ],
    acePolicy: 'WCAG_2_2',
  },
}

const DEFAULT_ENGINE: A11yEngine = 'ace'
const DEFAULT_WCAG_LEVEL: WcagLevel = '2.2_AA'
const DEFAULT_BEST_PRACTICES = true
const DEFAULT_SCREEN_SIZES: ScreenSize[] = [
  { width: 1280, height: 1024, label: '1280x1024' },
]

export interface ServerConfig {
  engine: A11yEngine
  wcagLevel: WcagLevel
  includeBestPractices: boolean
  screenSizes: ScreenSize[]
  headless: boolean
}

function parseWcagLevel(input: string | undefined): WcagLevel {
  if (!input) return DEFAULT_WCAG_LEVEL

  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/wcag\s*/gi, '')
    .replace(/\s+/g, '_')
    .replace(/level\s*/gi, '')
    .replace(/_+/g, '_')

  const match = normalized.match(/^(\d)\.?(\d)?[_\s]*(a{1,3})$/i)
  if (match) {
    const major = match[1]
    const minor = match[2] ?? '0'
    const level = match[3].toUpperCase()
    const key = `${major}.${minor}_${level}` as WcagLevel
    if (key in WCAG_LEVEL_MAP) return key
  }

  const directKey = input.trim() as WcagLevel
  if (directKey in WCAG_LEVEL_MAP) return directKey

  console.error(
    `Invalid WCAG_LEVEL "${input}", using default "${DEFAULT_WCAG_LEVEL}"`
  )
  return DEFAULT_WCAG_LEVEL
}

function parseScreenSizes(input: string | undefined): ScreenSize[] {
  if (!input) return DEFAULT_SCREEN_SIZES

  const sizes: ScreenSize[] = []
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const part of parts) {
    const match = part.match(/^(\d+)x(\d+)$/i)
    if (match) {
      sizes.push({
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
        label: part,
      })
    } else {
      console.error(
        `Invalid screen size format "${part}", expected "WIDTHxHEIGHT"`
      )
    }
  }

  return sizes.length > 0 ? sizes : DEFAULT_SCREEN_SIZES
}

/**
 * Load configuration from environment variables.
 * Call once at startup; result is cached.
 */
let cachedConfig: ServerConfig | null = null

export function loadConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig

  const engine =
    (process.env.A11Y_ENGINE?.toLowerCase() as A11yEngine) || DEFAULT_ENGINE
  const wcagLevel = parseWcagLevel(process.env.WCAG_LEVEL)
  const includeBestPractices =
    process.env.BEST_PRACTICES !== 'false' && DEFAULT_BEST_PRACTICES
  const screenSizes = parseScreenSizes(process.env.SCREEN_SIZES)
  // Default: headless=true (no browser window); set HEADLESS_BROWSER=false to show
  const headless = process.env.HEADLESS_BROWSER !== 'false'

  cachedConfig = {
    engine: engine === 'ace' ? 'ace' : 'axe',
    wcagLevel,
    includeBestPractices,
    screenSizes,
    headless,
  }
  return cachedConfig
}

/**
 * Get the current server config (loads from env if not yet loaded).
 */
export function getConfig(): ServerConfig {
  return loadConfig()
}

/**
 * Get axe-core tags for the configured WCAG level and best-practices setting.
 * Used when the tool input does not specify tags.
 */
export function getAxeTagsFromConfig(): string[] {
  const config = getConfig()
  const tags = [...WCAG_LEVEL_MAP[config.wcagLevel].axeTags]
  if (config.includeBestPractices) {
    tags.push('best-practice')
  }
  return tags
}

/**
 * Get ACE policy name for the configured WCAG level (for accessibility-checker).
 */
export function getAcePolicyFromConfig(): string {
  return WCAG_LEVEL_MAP[getConfig().wcagLevel].acePolicy
}
