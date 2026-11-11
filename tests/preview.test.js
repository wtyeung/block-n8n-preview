import test from 'node:test'
import assert from 'node:assert/strict'
import { assetUrl, validateWorkflow, previewHeight, parseMessage, parseWorkflowJson, readWorkflowBody, workflowSource, startPreview, PREVIEW_URL, SUCCESS } from '../block-n8n-preview/preview.js'

const origin = 'https://wiki.example'
const workflow = { nodes: [], connections: {} }
const tick = () => new Promise(resolve => setImmediate(resolve))
const target = new URL(PREVIEW_URL).origin

function setup(options = {}) {
  const events = new EventTarget()
  const frame = new EventTarget()
  const sent = []
  const statuses = []
  frame.contentWindow = { postMessage: (...args) => sent.push(args) }
  frame.removeAttribute = () => { delete frame.src }
  let signal
  const stop = startPreview({
    frame, events, url: `${origin}/workflow.json`, origin, debug: false,
    status: (...args) => statuses.push(args),
    fetcher: async (_url, init) => {
      signal = init.signal
      assert.equal(init.credentials, 'same-origin')
      assert.equal(init.redirect, 'error')
      return { ok: true, url: `${origin}/workflow.json`, text: async () => JSON.stringify(workflow) }
    },
    ...options
  })
  const message = (data = { command: 'n8nReady' }, source = frame.contentWindow, senderOrigin = target) => {
    events.dispatchEvent(new MessageEvent('message', { data, source: null, origin: senderOrigin }))
  }
  const ready = (data = { command: 'n8nReady' }, source = frame.contentWindow, senderOrigin = target) => {
    const event = new Event('message')
    Object.assign(event, { data, source, origin: senderOrigin })
    events.dispatchEvent(event)
  }
  return { frame, sent, statuses, stop, ready, message, signal: () => signal }
}

test('asset URL resolution and origin restrictions', () => {
  assert.equal(assetUrl('../asset.json', `${origin}/pages/demo`, origin), `${origin}/asset.json`)
  for (const value of ['', 'https://other.example/a', '//other.example/a', 'javascript:alert(1)', 'data:application/json,{}', 'https://user:pass@wiki.example/a']) {
    assert.throws(() => assetUrl(value, `${origin}/`, origin))
  }
})

test('a relative filename is a web path, not a filesystem or Wiki.js asset lookup', () => {
  assert.equal(assetUrl('test.json', `${origin}/folder/page`, origin), `${origin}/folder/test.json`)
  assert.equal(assetUrl('test.json', `${origin}/folder/page/`, origin), `${origin}/folder/page/test.json`)
})

test('body extraction reads fenced code, rendered text and empty bodies', () => {
  const json = JSON.stringify({ nodes: [], connections: {}, name: '<demo> & example' }, null, 2)
  const code = { textContent: `\n${json}\n` }
  assert.equal(readWorkflowBody({ querySelector: selector => selector === 'pre code' ? code : null }), json)
  assert.equal(readWorkflowBody({ querySelector: selector => selector === 'pre' ? code : null }), json)
  assert.equal(readWorkflowBody({ querySelector: () => null, textContent: `\n${json}\n` }), json)
  assert.equal(readWorkflowBody({ querySelector: () => ({ textContent: '\n  ' }) }), '')
  assert.deepEqual(workflowSource(readWorkflowBody({ querySelector: () => code }), '', `${origin}/`, origin).workflow.name, '<demo> & example')
})

test('pasted JSON source validates and rejects ambiguous inputs', () => {
  assert.deepEqual(workflowSource(JSON.stringify(workflow), '', `${origin}/`, origin), { workflow })
  assert.throws(() => workflowSource('{}', '/asset.json', `${origin}/`, origin), /not both/)
  assert.throws(() => parseWorkflowJson('not json'), /not valid JSON/)
  assert.throws(() => parseWorkflowJson(' <html>Login</html>'), /returned HTML/)
  assert.throws(() => parseWorkflowJson('{}'), /Invalid workflow/)
})

test('inline workflow does not fetch and exposes a validated download only after validation', async t => {
  let validated
  const s = setup({
    workflow,
    fetcher: () => { assert.fail('Pasted JSON must not fetch') },
    onValidated: value => { validated = value }
  })
  t.after(s.stop)
  assert.equal(validated, undefined)
  await tick()
  assert.equal(validated, workflow)
  s.ready()
  assert.equal(s.sent.length, 1)
})

test('HTML responses never enable download or navigate the preview', async () => {
  for (const contentType of ['text/html; charset=utf-8', 'application/octet-stream']) {
    let validated = false
    const s = setup({
      onValidated: () => { validated = true },
      fetcher: async () => ({
        ok: true, url: `${origin}/test.json`,
        headers: new Headers({ 'content-type': contentType }),
        text: async () => '<!DOCTYPE html><html>Wiki page</html>'
      })
    })
    await tick()
    assert.match(s.statuses.at(-1)[0], /returned HTML, not JSON/)
    assert.equal(validated, false)
    assert.equal(s.frame.src, undefined)
    s.stop()
  }
})

test('workflow shape and height bounds', () => {
  assert.equal(validateWorkflow(workflow), workflow)
  for (const value of [null, [], {}, { nodes: [], connections: [] }, { nodes: {}, connections: {} }]) assert.throws(() => validateWorkflow(value))
  assert.equal(previewHeight(undefined), 500)
  assert.equal(previewHeight(10), 200)
  assert.equal(previewHeight(9999), 1200)
})

test('message parser validates source, exact origin and shape', () => {
  const frame = { contentWindow: {} }
  const event = { source: frame.contentWindow, origin: target, data: '{"command":"n8nReady"}' }
  assert.equal(parseMessage(event, frame, target).command, 'n8nReady')
  for (const patch of [{ source: {} }, { origin: `${target}.evil.example` }, { data: 'bad json' }, { data: [] }, { data: null }, { data: { command: 1 } }]) {
    assert.equal(parseMessage({ ...event, ...patch }, frame, target), null)
  }
})

test('fetch before navigation, trusted handshake, duplicate suppression and debug off', async t => {
  const s = setup()
  t.after(s.stop)
  assert.equal(s.frame.src, undefined)
  s.ready()
  assert.equal(s.sent.length, 0)
  await tick()
  assert.equal(s.frame.src, PREVIEW_URL)
  s.ready(undefined, {})
  s.ready(undefined, undefined, origin)
  assert.equal(s.sent.length, 0)
  s.ready(JSON.stringify({ command: 'n8nReady' }))
  s.ready()
  s.frame.dispatchEvent(new Event('load'))
  assert.equal(s.sent.length, 1)
  assert.deepEqual(JSON.parse(s.sent[0][0]), { command: 'openWorkflow', workflow, hideNodeIssues: true })
  assert.equal(s.sent[0][1], target)
  assert.deepEqual(s.statuses.at(-1), ['', false])
  s.frame.dispatchEvent(new Event('load'))
  s.ready()
  s.ready()
  assert.equal(s.sent.length, 2)
})

test('multiple instances do not accept each other’s messages', async t => {
  const a = setup()
  const b = setup()
  t.after(a.stop)
  t.after(b.stop)
  await tick()
  a.ready(undefined, b.frame.contentWindow)
  assert.equal(a.sent.length, 0)
  b.ready()
  assert.equal(b.sent.length, 1)
  assert.equal(a.sent.length, 0)
})

test('debug displays success and logs only fixed diagnostics', async t => {
  const logs = []
  const original = console.debug
  console.debug = (...args) => logs.push(args)
  t.after(() => { console.debug = original })
  const s = setup({ debug: true })
  t.after(s.stop)
  await tick()
  s.ready()
  assert.equal(s.statuses.at(-1)[0], SUCCESS)
  assert.ok(logs.length > 0)
  assert.ok(!JSON.stringify(logs).includes('nodes'))
})

test('fetch, HTTP, redirect response, JSON and shape failures', async () => {
  const cases = [
    async () => { throw new Error('secret URL') },
    async () => ({ ok: false, status: 403 }),
    async () => ({ ok: true, url: 'https://other.example/a' }),
    async () => ({ ok: true, url: `${origin}/a`, text: async () => '{invalid' }),
    async () => ({ ok: true, url: `${origin}/a`, text: async () => '{}' })
  ]
  for (const fetcher of cases) {
    const s = setup({ fetcher })
    await tick()
    assert.equal(s.statuses.at(-1)[1], true)
    assert.equal(s.frame.src, undefined)
    assert.ok(!JSON.stringify(s.statuses).includes('secret'))
    s.stop()
  }
})

test('cleanup aborts and ignores stale async fetches and messages', async () => {
  let resolve
  const s = setup({ fetcher: () => new Promise(r => { resolve = r }) })
  await tick()
  s.stop()
  const count = s.statuses.length
  resolve({ ok: true, url: `${origin}/a`, text: async () => JSON.stringify(workflow) })
  await tick()
  s.ready()
  assert.equal(s.frame.src, undefined)
  assert.equal(s.sent.length, 0)
  assert.equal(s.statuses.length, count)
  const normal = setup()
  await tick()
  normal.stop()
  assert.equal(normal.signal().aborted, true)
})

test('timeout and preview errors remain visible without debug', async () => {
  const s = setup({
    timeout: 5,
    fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.match(s.statuses.at(-1)[0], /timed out/)
  s.ready()
  assert.equal(s.sent.length, 0)
  s.stop()
  const error = setup()
  await tick()
  error.ready({ command: 'error', message: 'sensitive payload' })
  assert.equal(error.statuses.at(-1)[1], true)
  assert.ok(!error.statuses.at(-1)[0].includes('sensitive'))
  error.stop()
})
