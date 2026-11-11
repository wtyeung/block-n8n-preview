import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectPreviewUrl, loadPreviewUrl } from './build-config.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const revision = 'bfb13cc1407712569bce264db98ae7645894d90d'
const build = path.join(root, '.build')
const previewUrl = await loadPreviewUrl()
await mkdir(path.join(build, 'blocks'), { recursive: true })
await mkdir(path.join(build, 'backend'), { recursive: true })
for (const file of ['blocks/package.mjs', 'blocks/rollup.config.mjs', 'backend/package.json']) {
  const response = await fetch(`https://raw.githubusercontent.com/requarks/wiki/${revision}/${file}`)
  if (!response.ok) throw new Error(`Unable to obtain pinned Wiki.js tooling: HTTP ${response.status}`)
  await writeFile(path.join(build, file), await response.text())
}
await cp(path.join(root, 'block-n8n-preview'), path.join(build, 'blocks/block-n8n-preview'), { recursive: true })
const previewPath = path.join(build, 'blocks/block-n8n-preview/preview.js')
await writeFile(previewPath, injectPreviewUrl(await readFile(previewPath, 'utf8'), previewUrl))
const hint = `Direct uploaded asset URL; leave blank for block-body JSON. Preview server: ${previewUrl}. To change the preview server, set N8N_PREVIEW_URL in .env, rebuild and reinstall the block, then fully refresh the wiki tab.`
if (hint.length > 1024) throw new Error('Preview server hint exceeds the Wiki.js property hint limit.')
const componentPath = path.join(build, 'blocks/block-n8n-preview/component.js')
const component = await readFile(componentPath, 'utf8')
const marker = "'__N8N_PREVIEW_SERVER_HINT__'"
if (!component.includes(marker)) throw new Error('Preview server hint marker is missing.')
await writeFile(componentPath, component.replace(marker, () => JSON.stringify(hint)))
execFileSync(process.execPath, ['package.mjs', 'block-n8n-preview'], { cwd: path.join(build, 'blocks'), stdio: 'inherit' })
await mkdir(path.join(root, 'packages'), { recursive: true })
const artifact = 'block-n8n-preview.wkblock'
await writeFile(path.join(root, 'packages', artifact), await readFile(path.join(build, 'blocks/packages', artifact)))
console.log(`Package: ${path.join(root, 'packages', artifact)}`)
