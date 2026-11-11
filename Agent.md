# Project: Wiki.js n8n Preview Content Block

## Goal

Maintain an installable custom content block for a self-hosted Wiki.js 3.3 deployment. Display an n8n workflow diagram from either JSON in the block body or a same-origin Wiki.js workflow JSON asset.

Administrators install the package through **Administration → Content Blocks → Install Block…**, without rebuilding the Wiki.js Docker image where package installation is supported. An Install Block button alone does not prove compatibility with a particular packager.

## Repository and verified tooling

This is a standalone block repository, not a Wiki.js source checkout. The reported image is `wiki:3.3`; registry, digest, and exact patch version are unknown.

Packaging uses Wiki.js 3.3.1 source revision `bfb13cc1407712569bce264db98ae7645894d90d`. `scripts/package.js` stages source and downloads the official writer/Rollup configuration/version metadata from that immutable revision. It generates the Parameters hint from the configured preview URL before invoking the official packager. Output is `packages/block-n8n-preview.wkblock`, format version 1.

From the repository root:

```sh
npm ci --ignore-scripts
npm run package
npm test
```

The standalone build has been verified with Node.js 24.21.0 and npm 12.0.2. Upstream's full development environment documents Node 26+. Edit source under `block-n8n-preview/`, never generated copies under `.build/`.

Before changing packaging or editor integration:

1. Inspect the pinned target source and local conventions.
2. Consult https://docs.js.wiki/dev/blocks and the matching source.
3. Verify definition schema, property types, package command/extension, and installation process.
4. Keep build dependencies and source revisions pinned; avoid unnecessary dependencies.
5. State unresolved compatibility assumptions in the README and final report. Do not invent version-specific commands or claim unperformed installation/browser tests.

## Block identity

- Block key: `n8n-preview`
- Element name: `block-n8n-preview`
- Source directory: `block-n8n-preview`
- Display name: `n8n Preview`

Preserve these matching names unless the verified target requires another convention.

## Authoring experience

Use the editor's block picker as the supported insertion path. Do not promise slash-menu integration without testing or source confirmation; explain any limitation and retain the picker fallback.

Declare all authorable attributes in the definition for forms and sanitization:

1. **Workflow JSON URL** — optional same-origin Wiki.js asset URL; required only when the body is empty.
2. **Debug logging** — boolean, default off. Explicit `false` and `0` attribute values must not enable it.
3. **Preview height** — default 500 px, clamped to 200–1200.

Support multiline JSON in the block body using `contentEditor: 'code'` and an empty fenced `json` template, following the target's source-editor conventions. Authors paste only the JSON object into Content/Edit Content; Markdown source uses a JSON fence inside the block. Require exactly one source: a URL or nonempty body JSON. Report missing or conflicting sources clearly.

Read rendered code text without treating it as HTML. Observe body edits, restart the preview safely, and clean up the observer on disconnect. Body JSON is page content and can appear in source/history/exports; document that it is not a secret store.

Do not migrate page content automatically. Keep README and project instructions focused on the current supported design rather than proof-of-concept history.

## Fixed preview server and Parameters hint

The maintainer selects the endpoint through build-time `N8N_PREVIEW_URL` in a repository-root `.env` file. Precedence: build-process environment, then `.env`, then the default. An empty/whitespace selected value uses the default. The public default in source `block-n8n-preview/preview.js` is:

`https://n8n-preview-service.internal.n8n.cloud/workflows/demo`

Keep local `.env` and `.build/` ignored and provide `.env.example` with the public default. Include `packages/` for distribution, but build any package intended for source control with the public preview URL, not a local address. Preserve the source default; inject the resolved URL directly into the staged preview module without an intermediate configuration file. Never bundle `.env` or credentials. Test precedence, missing/empty values, validation, and consistency between the destination and hint.

The preview server is **fixed at build time**, not an author-editable attribute or Docker runtime environment setting. Display its full resolved address as informational hint text in Parameters, associated with Workflow JSON URL. Remind maintainers to set `N8N_PREVIEW_URL` in `.env`, **rebuild and reinstall the block**, and fully refresh the wiki tab to change the destination.

Generate the hint from the same configuration used by the iframe so it cannot silently diverge. Keep staged metadata literal for the upstream AST-based packager and within the supported hint-length limit. Do not present an editable field as though the target supported read-only parameters; the reviewed form has no read-only input type.

Use an HTTP(S) endpoint without embedded credentials. Page authors must not be able to override the destination receiving workflow data. Do not add runtime configuration or author-selectable servers without explicit approval.

## Preview integration

Endpoint-specific protocol:

1. Load and validate workflow JSON from the selected source before navigating the iframe.
2. Install the message listener before assigning the iframe URL.
3. Wait for a message with `command: 'n8nReady'`.
4. Send a JSON-stringified message containing `command: 'openWorkflow'`, the complete workflow object, and `hideNodeIssues: true`.

This is not a universal n8n API. Verify against the configured endpoint where possible and distinguish user-reported success from automated browser verification.

Accept incoming messages as JSON strings or objects and validate the shape. For every incoming message verify both:

- `event.source` equals the instance's iframe `contentWindow`.
- `event.origin` equals the exact configured preview origin.

Send with the exact trusted target origin, never `*`. Do not send before readiness. Handle iframe reload readiness without uncontrolled duplicates and document any unverified event-ordering limitation. An iframe load event does not prove successful rendering.

Support multiple independent instances, each owning its workflow source, iframe, status, downloads, and message handling.

## Workflow handling and privacy

- Resolve relative asset URLs against the document base URL. A filename is not a Wiki.js asset lookup or local filesystem path.
- Permit only HTTP(S) asset URLs whose origin exactly matches the wiki origin; reject URL user-info.
- Fetch with same-origin credentials and check HTTP status.
- Reject cross-origin final responses. Fail closed on redirects where feasible; explain browser limitations and any rejection of same-origin redirects.
- Detect HTML responses and provide a useful direct-asset/login/permissions error, rather than offering an HTML download as JSON.
- Parse JSON and require at least an object with a `nodes` array and non-array `connections` object.
- Apply the same workflow-shape validation to body and asset modes.
- Never log workflow contents, credentials, tokens, or asset URLs that may contain sensitive query parameters, including in debug mode.
- The complete workflow object is sent to the configured endpoint. Do not claim it is sanitized or fully local.
- Recommend sanitized exports without credentials, tokens, private endpoints, webhook identifiers, pinned data, or sensitive metadata.
- Document that asset permissions may differ from page permissions and that body JSON is stored with page content.

## UI requirements

- Show loading/initialization states and useful fetch, JSON/shape, preview-error, missing-source, conflicting-source, and timeout messages.
- Place status/errors above the iframe, visible within editor previews. Hide the frame until validation succeeds and hide it again on failure.
- With debug off, hide `n8nReady received; workflow sent. Check the preview.` With debug on, show it and log only fixed non-sensitive diagnostics. Errors remain visible regardless of debug.
- Provide a **Download workflow JSON** link only after validation. URL mode links to the same-origin asset; body mode uses a JSON Blob. Use the HTML download attribute and revoke Blob URLs on cleanup. Document browser/server-header download limitations.
- Provide an accessible iframe title and readable live status/error messages.
- Use shadow-scoped styling, reset inherited editor whitespace, and use compact explicit gaps/margins. Avoid global CSS side effects.
- The editor owns its header and Parameters/Content/Remove buttons. `editor-header.css` is an optional, narrowly scoped administrator-applied theme override for wrapping the n8n Preview header, not an automatic package side effect. Preserve unrelated theme CSS.
- Clean up listeners, observers, timers, in-flight fetches, and Blob URLs when removed or reconfigured. Prevent stale async results from updating a newer configuration. Changing height should resize without refetching.

The desired presentation is read-only with zoom and pan. Do not claim read-only or execution-prevention guarantees unless the endpoint enforces them and verification establishes that. An iframe alone is not that security boundary.

## Operational limitations

Document preview X-Frame-Options/CSP frame-ancestors and wiki frame-src/connect-src restrictions. JavaScript cannot bypass these policies. Do not change reverse-proxy settings automatically or invent n8n environment variables.

Troubleshooting must cover readiness timeout, login/network failures, framing/CSP, asset permissions, invalid JSON/HTML, conflicting sources, body Apply/save behavior, and missing picker/slash entries.

After reinstalling a package, require a full browser-tab refresh. Reopening an editor does not replace a custom element already registered in the tab.

The reviewed 3.3.1 specification stores custom package data in the database and regenerates serving caches. Document this source-confirmed behavior while requiring verification of container recreation and backup/restore on the exact target image. Back up database, workflow asset storage, page content, source/lockfile, configuration, and packages. Do not claim page-only exports include installed block packages.

## Deliverables and verification

Maintain:

- Component source/definition and a reproducible pinned build that produces a package only when the verified tooling succeeds.
- User-oriented README covering n8n preview-server prerequisites (`N8N_PREVIEW_MODE=true` and `/workflows/demo`), official n8n-demo documentation links, installation, fixed-server hint, body/asset authoring, updates/removal, refresh requirements, persistence, backups, security, and troubleshooting. Distinguish the separately available n8n-demo component from this block's direct iframe integration.
- BUILDING.md for prerequisites, pinned tooling, exact build/test commands, server-address changes, implementation details, optional editor CSS, and the deployment acceptance checklist.
- A sanitized workflow fixture without credentials, tokens, private service URLs, or production data.
- Automated tests for validation, origin/source checks, independent instances, debug behavior, body extraction, cleanup/stale work, failures/timeout, compact layout/state, package integrity, and consistency of the server hint with configured destination.
- A manual checklist for target installation, Parameters hint, body and URL inputs, save/reopen, downloads, timeout, framing, independent instances, refresh, update/removal, and persistence/restore.

Never install into a live wiki or perform destructive operations without explicit approval. Never commit secrets or session cookies. Match existing code style and dependency policy.

## Final report

Summarize changed files, target/source revision, commands and actual results, package location, and remaining unverified assumptions, especially editor/slash integration, iframe protocol, read-only behavior, and persistence. Clearly distinguish automated checks, source confirmation, and user-reported browser results.
