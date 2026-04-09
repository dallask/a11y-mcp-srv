#!/usr/bin/env node
/**
 * Generates src/generated/ace-rule-metadata.json from IBM Equal Access engine rule sources.
 *
 * Sources (in order):
 * 1. ACE_RULES_SOURCE_DIR — local path to equal-access .../accessibility-checker-engine/src/v4/rules
 * 2. node_modules/accessibility-checker-engine/src/v4/rules (if present)
 * 3. GitHub API: IBMa/equal-access @ main-4.x (requires network)
 *
 * Run: node scripts/generate-ace-rule-metadata.mjs
 */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { writeFile, mkdir, readdir, readFile, access, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'src', 'generated')
const outFile = join(outDir, 'ace-rule-metadata.json')

const require = createRequire(import.meta.url)
const GITHUB_REF = process.env.ACE_RULES_GIT_REF || 'main-4.x'
const RULES_DIR_PATH = 'accessibility-checker-engine/src/v4/rules'

/** @type {Record<string, Record<string, { toolkitLevel: string, tags: string[] }>>} */
const byPolicy = {
  WCAG_2_0: {},
  WCAG_2_1: {},
  WCAG_2_2: {},
  IBM_Accessibility: {},
}

const POLICY_ORDER = ['WCAG_2_2', 'WCAG_2_1', 'WCAG_2_0']

const TAGS_BY_POLICY = {
  WCAG_2_0: {
    LEVEL_ONE: ['wcag2a'],
    LEVEL_TWO: ['wcag2a', 'wcag2aa'],
    LEVEL_THREE: ['wcag2a', 'wcag2aa', 'wcag2aaa'],
    LEVEL_FOUR: ['wcag2a', 'wcag2aa', 'wcag2aaa'],
  },
  WCAG_2_1: {
    LEVEL_ONE: ['wcag2a', 'wcag21a'],
    LEVEL_TWO: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    LEVEL_THREE: [
      'wcag2a',
      'wcag2aa',
      'wcag2aaa',
      'wcag21a',
      'wcag21aa',
      'wcag21aaa',
    ],
    LEVEL_FOUR: [
      'wcag2a',
      'wcag2aa',
      'wcag2aaa',
      'wcag21a',
      'wcag21aa',
      'wcag21aaa',
    ],
  },
  WCAG_2_2: {
    LEVEL_ONE: ['wcag2a', 'wcag21a', 'wcag22a'],
    LEVEL_TWO: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
    LEVEL_THREE: [
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
    LEVEL_FOUR: [
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
  },
}

function toolkitRank(level) {
  switch (level) {
    case 'LEVEL_ONE':
      return 1
    case 'LEVEL_TWO':
      return 2
    case 'LEVEL_THREE':
      return 3
    case 'LEVEL_FOUR':
      return 4
    default:
      return 0
  }
}

function pickWcagPolicyFromIds(ids) {
  for (const p of POLICY_ORDER) {
    if (ids.includes(p)) return p
  }
  return null
}

function tagsFor(policy, toolkitLevel) {
  const p = TAGS_BY_POLICY[policy]
  if (!p) return []
  const row = p[toolkitLevel] || p.LEVEL_TWO || []
  return [...row]
}

/**
 * @param {string} content
 * @returns {{ ruleId: string, entries: Array<{ ids: string[], toolkitLevel: string }> } | null}
 */
function parseRuleFile(content) {
  const idMatch = content.match(/\bexport\s+const\s+\w+\s*:\s*Rule\s*=\s*\{[\s\S]*?\bid\s*:\s*"([^"]+)"/)
  if (!idMatch) return null
  const ruleId = idMatch[1]

  const rs = content.indexOf('rulesets:')
  if (rs < 0) return { ruleId, entries: [] }

  const fromRulesets = content.slice(rs)
  const entries = []
  const blockRe =
    /\{\s*(?:"id"|id)\s*:\s*(?:\[\s*([^\]]*?)\s*\]|"([^"]+)")[\s\S]*?(?:"toolkitLevel"|toolkitLevel)\s*:\s*eToolkitLevel\.(LEVEL_\w+)/g
  let m
  while ((m = blockRe.exec(fromRulesets)) !== null) {
    const bracketIds = m[1]
    const singleId = m[2]
    const toolkitLevel = m[3]
    let ids = []
    if (singleId) ids = [singleId]
    else if (bracketIds) {
      ids = bracketIds
        .split(',')
        .map((s) => s.replace(/^\s*["']|["']\s*$/g, '').trim())
        .filter(Boolean)
    }
    if (ids.length && toolkitLevel) entries.push({ ids, toolkitLevel })
  }

  return { ruleId, entries }
}

function mergePolicyEntry(policy, ruleId, toolkitLevel, tagPolicy) {
  const existing = byPolicy[policy][ruleId]
  if (existing && toolkitRank(toolkitLevel) < toolkitRank(existing.toolkitLevel)) return
  byPolicy[policy][ruleId] = {
    toolkitLevel,
    tags: tagsFor(tagPolicy, toolkitLevel),
  }
}

/**
 * @param {{ ruleId: string, entries: Array<{ ids: string[], toolkitLevel: string }> }} parsed
 */
function ingestParsed(parsed) {
  const { ruleId, entries } = parsed
  for (const { ids, toolkitLevel } of entries) {
    const tagBase = pickWcagPolicyFromIds(ids) || 'WCAG_2_2'
    if (ids.includes('WCAG_2_0')) mergePolicyEntry('WCAG_2_0', ruleId, toolkitLevel, 'WCAG_2_0')
    if (ids.includes('WCAG_2_1')) mergePolicyEntry('WCAG_2_1', ruleId, toolkitLevel, 'WCAG_2_1')
    if (ids.includes('WCAG_2_2')) mergePolicyEntry('WCAG_2_2', ruleId, toolkitLevel, 'WCAG_2_2')
    if (ids.includes('IBM_Accessibility') || ids.includes('IBM_Accessibility_next')) {
      mergePolicyEntry('IBM_Accessibility', ruleId, toolkitLevel, tagBase)
    }
  }
}

async function loadLocalDir(dir) {
  const names = await readdir(dir)
  const files = names.filter((n) => n.endsWith('.ts') && !n.startsWith('_'))
  for (const name of files) {
    const content = await readFile(join(dir, name), 'utf8')
    const parsed = parseRuleFile(content)
    if (parsed) ingestParsed(parsed)
  }
}

async function pathExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Sparse-clone equal-access rule sources (avoids GitHub Contents API rate limits).
 * @returns {Promise<string>} path to v4/rules directory
 */
async function cloneRulesViaGit() {
  const dir = await mkdtemp(join(tmpdir(), 'ea-ace-rules-'))
  try {
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse -b ${GITHUB_REF} https://github.com/IBMa/equal-access.git "${dir}"`,
      { stdio: 'pipe', encoding: 'utf8' }
    )
    execSync(`git sparse-checkout set accessibility-checker-engine/src/v4/rules`, {
      cwd: dir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
  } catch (e) {
    await rm(dir, { recursive: true, force: true })
    throw e
  }
  return join(dir, 'accessibility-checker-engine', 'src', 'v4', 'rules')
}

async function fetchGithubRuleSources() {
  const headers = {
    'User-Agent': 'accessibility-mcp-server-ace-metadata-gen',
    Accept: 'application/vnd.github.v3+json',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`
  }
  const sources = []
  for (let page = 1; ; page++) {
    const url = new URL(
      `https://api.github.com/repos/IBMa/equal-access/contents/${encodeURI(RULES_DIR_PATH)}`
    )
    url.searchParams.set('ref', GITHUB_REF)
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const res = await fetch(url, { headers })
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    }
    const data = await res.json()
    if (!Array.isArray(data)) {
      throw new Error('Unexpected GitHub API response (expected array)')
    }
    if (data.length === 0) break
    for (const item of data) {
      if (item.type === 'file' && item.name.endsWith('.ts') && !item.name.startsWith('_')) {
        sources.push(item.download_url)
      }
    }
    if (data.length < 100) break
  }
  for (const downloadUrl of sources) {
    const res = await fetch(downloadUrl, { headers: { 'User-Agent': headers['User-Agent'] } })
    if (!res.ok) throw new Error(`Failed raw fetch ${downloadUrl}: ${res.status}`)
    const content = await res.text()
    const parsed = parseRuleFile(content)
    if (parsed) ingestParsed(parsed)
  }
}

async function main() {
  const envDir = process.env.ACE_RULES_SOURCE_DIR
  let engineRoot
  try {
    engineRoot = dirname(require.resolve('accessibility-checker-engine/package.json'))
  } catch {
    engineRoot = null
  }

  const localCandidates = [
    envDir,
    engineRoot ? join(engineRoot, 'src', 'v4', 'rules') : null,
  ].filter(Boolean)

  let loaded = false
  for (const dir of localCandidates) {
    if (await pathExists(dir)) {
      console.error(`Using local rule sources: ${dir}`)
      await loadLocalDir(dir)
      loaded = true
      break
    }
  }

  if (!loaded) {
    let tmpRulesDir = null
    try {
      console.error(`Cloning rule sources via git (ref ${GITHUB_REF})...`)
      tmpRulesDir = await cloneRulesViaGit()
      await loadLocalDir(tmpRulesDir)
      loaded = true
    } catch (e) {
      console.error('Git clone failed, falling back to GitHub API:', e.message)
    } finally {
      if (tmpRulesDir) {
        let repoRoot = tmpRulesDir
        for (let i = 0; i < 4; i++) repoRoot = dirname(repoRoot)
        await rm(repoRoot, { recursive: true, force: true }).catch(() => {})
      }
    }
    if (!loaded) {
      console.error(`Fetching rule sources from GitHub API (ref ${GITHUB_REF})...`)
      await fetchGithubRuleSources()
    }
  }

  let engineVersion = 'unknown'
  try {
    const pkg = JSON.parse(
      await readFile(join(engineRoot || join(root, 'node_modules/accessibility-checker-engine'), 'package.json'), 'utf8')
    )
    engineVersion = pkg.version
  } catch {
    // ignore
  }

  await mkdir(outDir, { recursive: true })
  const payload = {
    engineVersion,
    generatedRef: GITHUB_REF,
    byPolicy,
  }
  await writeFile(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  const counts = Object.fromEntries(
    Object.entries(byPolicy).map(([k, v]) => [k, Object.keys(v).length])
  )
  console.error('Wrote', outFile, 'counts', counts)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
