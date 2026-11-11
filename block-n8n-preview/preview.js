export const PREVIEW_URL = 'https://n8n-preview-service.internal.n8n.cloud/workflows/demo'
export const SUCCESS = 'n8nReady received; workflow sent. Check the preview.'

export function assetUrl(value, base, origin) {
  let url
  try { url = new URL(value, base) } catch { throw new Error('Enter a valid workflow JSON URL.') }
  if (!value?.trim() || !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
    throw new Error('Workflow JSON must be an HTTP(S) asset on this wiki.')
  }
  return url.href
}

export function validateWorkflow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.nodes) || !value.connections || typeof value.connections !== 'object' || Array.isArray(value.connections)) {
    throw new Error('Invalid workflow: expected a nodes array and connections object.')
  }
  return value
}

export function previewHeight(value) {
  const height = Number(value)
  return Number.isFinite(height) && height > 0 ? Math.max(200, Math.min(1200, height)) : 500
}

export function parseMessage(event, frame, origin) {
  if (event.source !== frame.contentWindow || event.origin !== origin) return null
  let data = event.data
  try { if (typeof data === 'string') data = JSON.parse(data) } catch { return null }
  return data && typeof data === 'object' && !Array.isArray(data) && typeof data.command === 'string' ? data : null
}

export function parseWorkflowJson(text) {
  if (/^\s*</.test(text)) {
    throw new Error('The workflow URL returned HTML, not JSON. Copy the direct uploaded asset URL from Wiki.js Assets; check login and asset permissions.')
  }
  let value
  try { value = JSON.parse(text) } catch { throw new Error('Workflow is not valid JSON. Paste the complete export or use a direct JSON asset URL.') }
  return validateWorkflow(value)
}

export function readWorkflowBody(element) {
  return ((element.querySelector('pre code') ?? element.querySelector('pre') ?? element).textContent ?? '').trim()
}

export function workflowSource(json, url, base, origin) {
  if (json?.trim() && url?.trim()) throw new Error('Use body JSON or a workflow URL, not both. For pasted JSON, clear Workflow JSON URL in Parameters, then apply Content again.')
  if (json?.trim()) return { workflow: parseWorkflowJson(json) }
  if (!url?.trim()) throw new Error('No workflow source. Paste a complete JSON export into Content and click Apply, or set Workflow JSON URL in Parameters.')
  return { url: assetUrl(url, base, origin) }
}

export function startPreview({ frame, url, workflow: inlineWorkflow, origin, debug, status, onValidated = () => {}, events = window, fetcher = fetch, timeout = 30000 }) {
  const controller = new AbortController()
  const targetOrigin = new URL(PREVIEW_URL).origin
  let active = true
  let workflow
  let sent = false
  let loaded = false
  let timer
  const log = message => { if (debug) console.debug('[n8n-preview]', message) }
  const clear = () => clearTimeout(timer)
  const fail = message => {
    if (!active || controller.signal.aborted) return
    clear()
    controller.abort()
    workflow = undefined
    status(message, true)
    log('Preview failed')
  }
  const wait = () => {
    clear()
    timer = setTimeout(() => fail('Preview readiness timed out. Check login, network, framing policies, and n8nReady support.'), timeout)
  }
  const message = event => {
    if (!active || !workflow) return
    const data = parseMessage(event, frame, targetOrigin)
    if (!data) return
    if (data.command === 'error' || data.command === 'n8nError') {
      fail('The preview reported an error. Check the preview service.')
    } else if (data.command === 'n8nReady' && !sent) {
      sent = true
      clear()
      try {
        frame.contentWindow.postMessage(JSON.stringify({ command: 'openWorkflow', workflow, hideNodeIssues: true }), targetOrigin)
        status(debug ? SUCCESS : '', false)
        log('Workflow sent to trusted preview')
      } catch { fail('Unable to send workflow to the preview.') }
    }
  }
  const load = () => {
    if (!active || !workflow) return
    if (loaded) {
      sent = false
      status('Preview loaded. Waiting for readiness…', false)
      wait()
    }
    loaded = true
    log('Iframe load event (rendering not confirmed)')
  }
  events.addEventListener('message', message)
  frame.addEventListener('load', load)
  status('Loading workflow…', false)
  wait()
  Promise.resolve().then(async () => {
    if (!active || controller.signal.aborted) return
    let value = inlineWorkflow
    if (!value) {
      let response
      try {
        response = await fetcher(url, { credentials: 'same-origin', redirect: 'error', signal: controller.signal })
      } catch {
        if (active) fail('Unable to fetch workflow. Check asset permissions, network, or redirects.')
        return
      }
      if (!active || controller.signal.aborted) return
      if (!response.ok) return fail(`Workflow fetch failed (HTTP ${response.status}).`)
      if (!response.url || new URL(response.url).origin !== origin) return fail('Workflow response must remain on this wiki.')
      const contentType = response.headers?.get('content-type') || ''
      if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        return fail('The workflow URL returned HTML, not JSON. Copy the direct uploaded asset URL from Wiki.js Assets; check login and asset permissions.')
      }
      try { value = parseWorkflowJson(await response.text()) } catch (error) { return fail(error.message) }
    }
    if (!active || controller.signal.aborted) return
    try { workflow = validateWorkflow(value) } catch (error) { return fail(error.message) }
    onValidated(workflow)
    status('Initializing preview…', false)
    log('Workflow validated')
    frame.src = PREVIEW_URL
  }).catch(() => fail('Unable to initialize workflow preview.'))
  return () => {
    active = false
    workflow = undefined
    controller.abort()
    clear()
    events.removeEventListener('message', message)
    frame.removeEventListener('load', load)
    frame.removeAttribute('src')
  }
}
