import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'dist', 'generated'), { recursive: true })
copyFileSync(
  join(root, 'src', 'generated', 'ace-rule-metadata.json'),
  join(root, 'dist', 'generated', 'ace-rule-metadata.json')
)
