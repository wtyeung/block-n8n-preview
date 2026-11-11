# Building and maintaining n8n Preview

For installation, page authoring, n8n preview-server prerequisites, and user troubleshooting, see [README.md](README.md).

## Target and pinned tooling

This is a standalone block repository targeting the reported `wiki:3.3` deployment. Registry, image digest, and exact patch version are unknown. Package tooling is pinned to **Wiki.js 3.3.1**, source revision **`bfb13cc1407712569bce264db98ae7645894d90d`**.

References:

- https://docs.js.wiki/dev/blocks
- https://docs.js.wiki/admin/blocks
- https://github.com/requarks/wiki/blob/bfb13cc1407712569bce264db98ae7645894d90d/dev/specs/wkblock.md

The reviewed source supports `.wkblock` format version 1, literal `static definition` metadata, and string/number/boolean/select/icon properties. All authorable attributes must be declared for editor forms and sanitization. The package format does not enforce a compatibility range.

The user has reported successful asset and block-body previews in the target wiki after a full refresh. That is distinct from automated browser verification. Editor/slash integration, reload event ordering, endpoint read-only enforcement, installed-block persistence, and backup/restore require target-specific checks.

## Prerequisites

- Node.js 24 or newer for this standalone build; verified locally with **Node 24.21.0** and **npm 12.0.2**.
- Upstream's full development environment documents Node 26+. This project does not build the full Wiki.js application.
- Internet access to the npm registry and `raw.githubusercontent.com`.
- No live wiki or database is required to build or run the unit tests.

## Build and test

Run from the repository root:

```sh
npm ci --ignore-scripts
npm run package
npm test
```

These commands have succeeded locally. The package output is:

```text
packages/block-n8n-preview.wkblock
```

Run packaging before tests so the package-integrity test validates the current artifact. That test skips if no artifact exists. There are **25 automated tests**, including environment/default resolution and `.env` loading, source validation, HTML response rejection, origin/source checks, multiple instances, debug behavior, cleanup/stale work, failures/timeout, compact template/state checks, and package integrity/server-hint consistency. Both public-default and local `.env` builds have passed packaging and all 25 tests.

Component tests run in Lit's Node environment with mocked browser objects. They do not measure real browser layout or execute a Wiki.js editor or remote n8n service. Follow the acceptance checklist below for deployment verification.

The current lockfile has two low-severity development dependency advisories through `@rollup/plugin-node-resolve` / `deepmerge`. These tools are not shipped in the block bundle. Reassess advisories before releases; do not bypass dependency security controls or apply an unreviewed forced downgrade.

## How packaging works

`scripts/package.js`:

1. Resolves `N8N_PREVIEW_URL` from the build process environment, then the repository-root `.env`, then the public default. Node's built-in `.env` parser is used; no dotenv dependency is needed. Validates HTTP(S) and rejects embedded credentials.
2. Downloads the official `blocks/package.mjs`, `blocks/rollup.config.mjs`, and `backend/package.json` from the pinned Wiki.js revision into `.build/`.
3. Copies `block-n8n-preview/` into `.build/blocks/block-n8n-preview/` and injects the resolved URL directly into the staged `preview.js` declaration as a JavaScript string literal. There is no intermediate configuration module. The public default in source is not overwritten.
4. Replaces the `__N8N_PREVIEW_SERVER_HINT__` literal in the staged component with a literal hint containing the configured server and rebuild/reinstall reminder. It enforces the target's 1024-character hint limit.
5. Executes the official packager for `block-n8n-preview`, equivalent to upstream's `npm run package -- block-n8n-preview` from its `blocks/` workspace.
6. Copies the generated artifact to `packages/block-n8n-preview.wkblock`.

This keeps the repository standalone while using the official writer and metadata extraction. No custom Wiki.js Docker image is built or deployed. Dependencies are limited to this block's needs and pinned in package.json/package-lock.json. Lit is bundled into the module. Build tools and the separate `<n8n-demo>` package are not runtime dependencies of the installed block.

`.env`, `.build/`, and `node_modules/` are ignored. `packages/` is included for distributing the public build; explicitly build with `N8N_PREVIEW_URL=https://n8n-preview-service.internal.n8n.cloud/workflows/demo` before committing the package so it does not embed a local server address. `.env.example` remains shareable. **Edit source files, not generated copies under `.build/`.** Package timestamps vary, so identical source builds are not byte-for-byte identical artifacts.

## Changing the preview server

Create a **`.env` file in the repository root** and set **`N8N_PREVIEW_URL`** to the full address of your approved preview server's `/workflows/demo` page. `.env.example` provides the public default:

```dotenv
N8N_PREVIEW_URL=https://n8n-preview-service.internal.n8n.cloud/workflows/demo
```

Replace that value in your local `.env` with your own server address. `.env` and `.env.*` are ignored by version control except `.env.example`. The resolved URL is embedded in the distributed package and displayed to authors, so it must not contain credentials or secrets.

Precedence is **build-process environment → root `.env` → default**. If neither source defines `N8N_PREVIEW_URL`, or the selected value is empty/whitespace, the default is `https://n8n-preview-service.internal.n8n.cloud/workflows/demo`. An explicitly empty build-process variable selects that default even if `.env` contains a custom URL. Invalid nonempty values fail the build. The default is the n8n-demo component's documented service address; availability and suitability for your wiki are not guaranteed.

For a one-off build, a shell-provided `N8N_PREVIEW_URL` overrides `.env`. Use the same environment when running the package-integrity test, which compares the artifact with the currently resolved build configuration. The `.env` file is resolved relative to this repository, not the shell's working directory, and is never bundled.

Use the full address including any deployment path prefix. The n8n service must be configured with **`N8N_PREVIEW_MODE=true`** and compatible message-origin/framing policies; see the [server prerequisites in README.md](README.md#set-up-the-n8n-preview-server).

After saving `.env`, run:

```sh
npm run package
npm test
```

Reinstall `packages/block-n8n-preview.wkblock` through Administration → Content Blocks and **fully refresh the wiki tab**. Check that Parameters displays the expected server in the Workflow JSON URL hint.

Both the destination and the informational hint are generated from the same resolved URL. Set local addresses only in the ignored `.env` or build-process environment; do not edit the public default in source or generated files under `.build/`. The preview address is not author-editable. Changing `.env` or setting a variable on a running Wiki.js container does not change an installed package: rebuild, reinstall, and refresh. A Docker environment variable is used only if it is present in the process actually running the build. `N8N_PREVIEW_MODE` belongs to the **n8n server** and is separate from the block's build-time `N8N_PREVIEW_URL`.

## Implementation notes

### Definition and authoring

Preserve the matching identity: directory `block-n8n-preview`, key `n8n-preview`, and element `block-n8n-preview`.

The definition declares `workflow-url`, `debug`, and `height`. The server is informational text in the URL property's hint because the reviewed Parameters form has no read-only input type. Keep the definition literal for the official AST reader.

Body mode declares `contentEditor: 'code'` and an empty JSON fence. It follows the built-in Diagram block's source-editor convention, reading rendered `pre code` / `pre` text rather than HTML. A light-DOM MutationObserver restarts the preview on body edits and is disconnected on cleanup. Require exactly one source: body JSON or a workflow URL.

Lit normally treats any present Boolean attribute as true. The custom debug converter also treats explicit `false` and `0` values as off, matching the Visual editor's string-valued attributes.

### Validation and privacy

Resolve assets against `document.baseURI`. Only same-origin HTTP(S) URLs without user-info are accepted. Fetch uses same-origin credentials and `redirect: 'error'`, rejecting **all** redirects, including same-origin redirects. Browser page JavaScript cannot reliably inspect each redirect before following it; the final response origin is checked as well.

Detect HTML, parse JSON, and validate an object with a `nodes` array and non-array `connections` object. Body JSON uses the same shape validation. The download link appears only after validation; body downloads use Blob URLs revoked on cleanup, while asset downloads retain the original same-origin URL.

The complete object is sent to the configured preview service. Do not sanitize by silently removing fields or claim local-only rendering. Do not log workflow contents, credentials, tokens, or asset URLs with sensitive query parameters.

### Iframe protocol and lifecycle

After validation, install listeners before navigating and wait for `n8nReady`. Send a JSON-stringified `openWorkflow` message containing the workflow and `hideNodeIssues: true`. Incoming messages may be objects or JSON strings and must match both the iframe window and exact configured origin. Outgoing target origin is never `*`.

This is endpoint-specific behavior, not a universal n8n API. The official [n8n-demo API](https://n8n-io.github.io/n8n-demo-webcomponent/api/) documents the related preview component and `/workflows/demo` destination. This block implements its own iframe integration; do not describe it as bundling `<n8n-demo>`.

Each instance owns its iframe, fetch, listener, timeout, status, and downloads. Source/debug changes abort old work and ignore stale results; height changes only resize. Duplicate readiness messages are suppressed between observed loads. An iframe reload requires fresh readiness; a ready event preceding the reload load event may need to be emitted again. Verify that ordering with the configured endpoint. A load event alone does not prove rendering.

Status/errors appear above the frame. The frame stays hidden until validation succeeds and is hidden on failure. Shadow-scoped styles reset inherited editor whitespace and use explicit compact gaps. Errors remain visible with debug off; success text and fixed console diagnostics require debug on.

## Optional multiline Visual editor header

`editor-header.css` places name/actions on the first row and wrapping parameters below; narrow screens place buttons on a third row. The editor owns this toolbar outside the block's shadow root, so this CSS is not applied by the package.

An administrator can append it to **Administration → Theme → CSS Override**, preserving existing rules, then save and refresh. Its `:has()` selectors target only Visual editor headers containing `block-n8n-preview`. Remove only the appended rules to undo it. The override is source-matched to 3.3.1 but not browser-tested in the target wiki; another editor version may need adjustments. Do not inject global theme changes automatically.

## Deployment acceptance checklist

Use a test wiki first. User-reported working previews do not establish every item below:

- [ ] Configure a compatible n8n instance with `N8N_PREVIEW_MODE=true`, verify `/workflows/demo`, approved message origins, and embedding policies.
- [ ] Install/reinstall without a wiki image rebuild and fully refresh the tab.
- [ ] Inspect all three properties and the fixed server hint/rebuild reminder.
- [ ] Insert via picker, paste multiline body JSON, Apply, save/reopen in Markdown and Visual editors, and verify preview/download.
- [ ] Clear the body and verify a direct uploaded asset URL; reject both sources filled.
- [ ] Edit the body while loading; confirm only the newest workflow is sent.
- [ ] Verify loading/errors, invalid JSON/shape, HTML, HTTP/network/permission failures, redirects, timeout, preview error messages, download behavior, and debug on/off.
- [ ] Test two blocks with different sanitized workflows and independent state.
- [ ] Navigate away/back, remove/reinsert, reload the iframe, and fully reload the page.
- [ ] Check framing/CSP failures, endpoint authentication, zoom/pan, and actual read-only enforcement.
- [ ] Set N8N_PREVIEW_URL in .env, rebuild/reinstall, and confirm both the hint and destination change; verify the default when no value is configured.
- [ ] Check slash-menu availability separately; use the picker fallback if absent.
- [ ] Verify update/removal, database backup/restore, and persistence after container recreation on the exact deployed image.

## Release and operational boundaries

Reinstall the same block key for updates and fully refresh tabs to load new custom-element code. Keep a previous package for rollback. The reviewed 3.3.1 implementation stores packages in `blocks.packageData` and regenerates disk caches; confirm persistence and restores in the target deployment. Back up database, page content, workflow assets/storage, source/lockfile, endpoint configuration, and packages.

Do not install into a live wiki, change reverse proxies, or perform destructive actions without explicit approval. Do not commit secrets or session cookies. Report the source revision, actual build/test results, artifact path, user-reported behavior, and remaining unverified assumptions separately.
