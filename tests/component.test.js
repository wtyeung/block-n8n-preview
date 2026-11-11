import test from 'node:test'
import assert from 'node:assert/strict'
import 'lit'

const previousWindow = globalThis.window
const previousDocument = globalThis.document
const registered = new Map()
globalThis.window = {
  location: { origin: 'https://wiki.example' },
  customElements: { define: (name, element) => registered.set(name, element) }
}
globalThis.document = { baseURI: 'https://wiki.example/page' }
const { BlockN8nPreviewElement } = await import('../block-n8n-preview/component.js')
globalThis.window = previousWindow
globalThis.document = previousDocument

function component() {
  const element = new BlockN8nPreviewElement()
  Object.defineProperty(element, 'isConnected', { value: true })
  return element
}

test('layout resets inherited whitespace and uses explicit compact spacing', () => {
  const css = BlockN8nPreviewElement.styles.cssText
  assert.match(css, /:host\s*\{[^}]*white-space:\s*normal/)
  assert.match(css, /\.box\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*8px/)
  assert.match(css, /p\s*\{[^}]*margin:\s*0;/)
})

test('explicit false debug attributes do not enable success text or logging', () => {
  const convert = BlockN8nPreviewElement.properties.debug.converter
  for (const value of [null, 'false', 'FALSE', ' false ', '0']) assert.equal(convert(value), false)
  for (const value of ['', 'true', '1']) assert.equal(convert(value), true)
})

test('source errors are rendered before the iframe and keep it hidden', () => {
  globalThis.window = { location: { origin: 'https://wiki.example' } }
  globalThis.document = { baseURI: 'https://wiki.example/page' }
  try {
    const element = component()
    element.workflowUrl = '/workflow.json'
    element._body = '{"nodes":[],"connections":{}}'
    element.updated(new Map([['_body', '']]))
    assert.match(element._status, /clear Workflow JSON URL/)
    assert.equal(element._error, true)
    assert.equal(element._validated, false)
    const result = element.render()
    const status = result.values[0]
    const frame = result.values[1].values[1]
    assert.ok(status.strings.join('').includes('role="status"'))
    assert.ok(frame.strings.join('').includes('?hidden='))
    assert.equal(frame.values[0], true)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})

test('missing source provides an actionable message without an empty visible frame', () => {
  globalThis.window = { location: { origin: 'https://wiki.example' } }
  globalThis.document = { baseURI: 'https://wiki.example/page' }
  try {
    const element = component()
    element.updated(new Map([['workflowUrl', undefined]]))
    assert.match(element._status, /No workflow source/)
    assert.equal(element._validated, false)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
