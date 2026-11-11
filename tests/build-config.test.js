import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { injectPreviewUrl, resolvePreviewUrl, loadPreviewUrl } from '../scripts/build-config.js'

const fallback = 'https://n8n-preview-service.internal.n8n.cloud/workflows/demo'
const local = 'https://preview.example/workflows/demo'

test('build configuration uses the public default when no variable is set', () => {
  assert.equal(resolvePreviewUrl(), fallback)
})

test('injects the URL directly without an intermediate configuration module', () => {
  const source = `export const PREVIEW_URL = '${fallback}'\nexport const OTHER = true\n`
  const result = injectPreviewUrl(source, local)
  assert.equal(result, `export const PREVIEW_URL = ${JSON.stringify(local)}\nexport const OTHER = true\n`)
  assert.ok(source.includes(fallback))
  assert.throws(() => injectPreviewUrl('', local), /Expected one/)
  assert.throws(() => injectPreviewUrl(source + source, local), /Expected one/)
})

test('shell environment takes precedence over .env', () => {
  assert.equal(resolvePreviewUrl({}, { N8N_PREVIEW_URL: local }), local)
  assert.equal(resolvePreviewUrl({ N8N_PREVIEW_URL: fallback }, { N8N_PREVIEW_URL: local }), fallback)
})

test('empty or whitespace values select the default', () => {
  assert.equal(resolvePreviewUrl({}, { N8N_PREVIEW_URL: '  ' }), fallback)
  assert.equal(resolvePreviewUrl({ N8N_PREVIEW_URL: '' }, { N8N_PREVIEW_URL: local }), fallback)
  assert.equal(resolvePreviewUrl({ N8N_PREVIEW_URL: `  ${local}  ` }), local)
})

test('build configuration rejects invalid destinations without exposing their values', () => {
  for (const value of ['invalid', 'javascript:alert(1)', 'file:///tmp/a', 'https://user:secret@preview.example/workflows/demo']) {
    assert.throws(() => resolvePreviewUrl({ N8N_PREVIEW_URL: value }), error => {
      assert.ok(!error.message.includes('secret'))
      return /HTTP\(S\)/.test(error.message)
    })
  }
})

test('loads quoted .env values and handles an absent file without changing process.env', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'n8n-preview-env-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const envFile = path.join(directory, '.env')
  assert.equal(await loadPreviewUrl({ env: {}, envFile }), fallback)
  await writeFile(envFile, `N8N_PREVIEW_URL="${local}"\n`)
  const before = process.env.N8N_PREVIEW_URL
  assert.equal(await loadPreviewUrl({ env: {}, envFile }), local)
  assert.equal(await loadPreviewUrl({ env: { N8N_PREVIEW_URL: fallback }, envFile }), fallback)
  assert.equal(process.env.N8N_PREVIEW_URL, before)
})
