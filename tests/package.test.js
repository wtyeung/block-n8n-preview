import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { loadPreviewUrl } from '../scripts/build-config.js'

const file = new URL('../packages/block-n8n-preview.wkblock', import.meta.url)

test('built package has valid v1 header, metadata and payload digests', { skip: !existsSync(file) }, async () => {
  const previewUrl = await loadPreviewUrl()
  const bytes = readFileSync(file)
  assert.equal(bytes.subarray(0, 8).toString(), 'WKBLOCK\0')
  assert.equal(bytes.readUInt32BE(8), 1)
  let offset = 16 + bytes.readUInt32BE(12)
  const header = JSON.parse(gunzipSync(bytes.subarray(16, offset)))
  assert.equal(header.block, 'n8n-preview')
  assert.equal(header.definition.name, 'n8n Preview')
  assert.deepEqual(header.definition.props.map(prop => prop.name), ['workflow-url', 'debug', 'height'])
  assert.equal(header.definition.contentEditor, 'code')
  assert.equal(header.definition.template, '```json\n\n```')
  assert.notEqual(header.definition.props[0].required, true)
  const hint = header.definition.props[0].hint
  assert.ok(hint.includes(`Preview server: ${previewUrl}`))
  assert.match(hint, /N8N_PREVIEW_URL in \.env/)
  assert.match(hint, /rebuild and reinstall the block/)
  assert.ok(hint.length <= 1024)
  assert.ok(!hint.includes('__N8N_PREVIEW_SERVER_HINT__'))
  assert.ok(header.files.some(entry => entry.path === 'block-n8n-preview.js'))
  for (const entry of header.files) {
    assert.match(entry.path, /^block-n8n-preview(?:\.js|\/.*)$/)
    const payload = gunzipSync(bytes.subarray(offset, offset + entry.compressedSize))
    offset += entry.compressedSize
    assert.equal(payload.length, entry.size)
    assert.equal(createHash('sha256').update(payload).digest('hex'), entry.sha256)
  }
  assert.equal(offset, bytes.length)
})
