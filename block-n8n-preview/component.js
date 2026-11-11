import { css, html, LitElement } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { readWorkflowBody, workflowSource, previewHeight, startPreview } from './preview.js'

export class BlockN8nPreviewElement extends LitElement {
  static definition = {
    block: 'n8n-preview',
    name: 'n8n Preview',
    description: 'Preview a workflow JSON asset using the trusted n8n preview service.',
    icon: 'plugin',
    template: '```json\n\n```',
    contentEditor: 'code',
    props: [
      { name: 'workflow-url', type: 'string', label: 'Workflow JSON URL', url: true, default: '', hint: '__N8N_PREVIEW_SERVER_HINT__' },
      { name: 'debug', type: 'boolean', label: 'Debug logging', default: false },
      { name: 'height', type: 'number', label: 'Preview height', default: 500, hint: 'Height in pixels, clamped to 200–1200.' }
    ]
  }

  static properties = {
    workflowUrl: { type: String, attribute: 'workflow-url' },
    _body: { state: true },
    debug: { type: Boolean, converter: value => value !== null && !['false', '0'].includes(value.trim().toLowerCase()) },
    height: { type: Number },
    _status: { state: true },
    _error: { state: true },
    _validated: { state: true },
    _asset: { state: true }
  }

  static styles = css`
    :host { display: block; white-space: normal; line-height: 1.5; }
    .box { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; white-space: normal; }
    iframe { display: block; width: 100%; border: 1px solid currentColor; border-radius: 6px; box-sizing: border-box; }
    iframe[hidden] { display: none; }
    p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
    .error { color: #b42318; background: #fff0ee; padding: 8px; border-radius: 4px; }
    a { color: var(--q-primary, #2563eb); }
  `

  constructor() {
    super()
    this.workflowUrl = ''
    this._body = ''
    this.debug = false
    this.height = 500
    this._status = ''
    this._error = false
    this._validated = false
    this._asset = ''
  }

  connectedCallback() {
    super.connectedCallback()
    this._restart = true
    this._body = readWorkflowBody(this)
    this._bodyObserver = new MutationObserver(() => { this._body = readWorkflowBody(this) })
    this._bodyObserver.observe(this, { childList: true, subtree: true, characterData: true })
    this.requestUpdate()
  }

  disconnectedCallback() {
    this._bodyObserver?.disconnect()
    this._stop?.()
    this._stop = undefined
    this._clearDownload()
    super.disconnectedCallback()
  }

  _clearDownload() {
    if (this._blob) URL.revokeObjectURL(this._blob)
    this._blob = undefined
    this._asset = ''
  }

  updated(changed) {
    if (!this.isConnected || (!this._restart && !changed.has('workflowUrl') && !changed.has('_body') && !changed.has('debug'))) return
    this._restart = false
    this._stop?.()
    this._stop = undefined
    this._clearDownload()
    this._validated = false
    try {
      const source = workflowSource(this._body, this.workflowUrl, document.baseURI, window.location.origin)
      this._stop = startPreview({
        frame: this.renderRoot.querySelector('iframe'),
        ...source,
        onValidated: workflow => {
          this._validated = true
          if (source.url) this._asset = source.url
          else {
            this._blob = URL.createObjectURL(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' }))
            this._asset = this._blob
          }
        },
        origin: window.location.origin,
        debug: this.debug,
        status: (text, error) => {
          this._status = text
          this._error = error
          if (error) this._validated = false
        }
      })
    } catch (error) {
      this._status = error.message
      this._error = true
    }
  }

  render() {
    return html`<div class="box">
      ${this._status ? html`<p role="status" aria-live="polite" class=${this._error ? 'status error' : 'status'}>${this._status}</p>` : null}
      ${keyed(JSON.stringify([this.workflowUrl, this._body, this.debug]), html`<iframe ?hidden=${!this._validated} title="n8n workflow diagram preview" style="height: ${previewHeight(this.height)}px" referrerpolicy="no-referrer"></iframe>`)}
      ${this._asset ? html`<p><a href=${this._asset} download="workflow.json">Download workflow JSON</a></p>` : null}
    </div>`
  }
}

window.customElements.define('block-n8n-preview', BlockN8nPreviewElement)
