# n8n Preview for Wiki.js

**An installable custom content block for Wiki.js 3.3** that displays interactive n8n workflow diagrams directly on Wiki.js pages. Authors can paste workflow JSON into the block or select a JSON file uploaded to Wiki.js. Readers can view the diagram and download the workflow.

**For administrators and page authors:** follow this guide. **For maintainers building or changing the package:** see [BUILDING.md](BUILDING.md).

## What you need

- A Wiki.js instance with **Administration → Content Blocks → Install Block…**. This project targets Wiki.js 3.3.
- The block package: [`packages/block-n8n-preview.wkblock`](packages/block-n8n-preview.wkblock).
- An n8n preview server reachable by readers' browsers, configured as described below.
- A sanitized workflow JSON export. [`fixtures/sanitized-workflow.json`](fixtures/sanitized-workflow.json) is a safe example to try.

### Set up the n8n preview server

The preview requires an n8n server running with:

```text
N8N_PREVIEW_MODE=true
```

Set this on the **n8n service**, not the Wiki.js service. For Docker Compose, add it to the n8n service's environment configuration:

```yaml
environment:
  N8N_PREVIEW_MODE: "true"
```

Apply the environment change using your normal deployment process; changing the configuration does not update an already-running container's environment. Prefer a dedicated preview instance rather than changing a production workflow-execution server.

The block uses the server's special **`/workflows/demo`** preview page. With preview mode correctly configured and no additional authentication imposed by your hosting setup, readers do not need to log in to n8n. The preview address is the server's origin plus `/workflows/demo`; if n8n is hosted under a path prefix, include that prefix.

The n8n server must support the preview message protocol, and its framing policies must allow the wiki to embed it. If your n8n version supports `N8N_POSTMESSAGE_ALLOWED_ORIGINS`, configure it to allow the wiki's exact origin (scheme, hostname, and port). Current n8n documentation specifies a comma-separated list and notes that an empty value accepts messages from any origin. Verify the settings against your deployed n8n version.

Official references:

- [n8n deployment environment variables — includes N8N_PREVIEW_MODE](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/deployment)
- [n8n security environment variables — includes N8N_POSTMESSAGE_ALLOWED_ORIGINS](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security)

Preview mode is an n8n server setting. It does not make an arbitrary n8n version automatically compatible with this block or establish a security guarantee that workflows cannot execute. Check the actual preview behavior before making it available to readers.

**Community nodes:** If your workflow uses community nodes, those nodes must also be installed on the **n8n preview server** for the workflow to preview correctly. Installing them only on the n8n instance where you created the workflow is not enough. Missing nodes may appear as unknown nodes or render incorrectly.

### About the `<n8n-demo>` web component

n8n provides **`<n8n-demo>`**, a web component for rendering workflow previews. It accepts workflow JSON and a `src` address pointing to an n8n preview server's `/workflows/demo` page.

- **Documentation and examples:** https://n8n-io.github.io/n8n-demo-webcomponent/
- **API, including the `workflow` and `src` attributes:** https://n8n-io.github.io/n8n-demo-webcomponent/api/
- **Installation instructions:** https://n8n-io.github.io/n8n-demo-webcomponent/install/
- **npm package:** https://www.npmjs.com/package/@n8n_io/n8n-demo-component

This Wiki.js block uses the preview iframe/message protocol directly; it **does not bundle or require installation of `<n8n-demo>`**. The component is an alternative for embedding previews in other websites. Both approaches need a compatible preview server; the component itself is not a replacement for that server. Configure an approved server rather than relying on the component's documented default service.

## Install the block

1. Back up the wiki database and preserve the previous package if updating. Install only trusted block packages: they run JavaScript in readers' browsers.
2. Open **Administration → Content Blocks → Install Block…**.
3. Select `packages/block-n8n-preview.wkblock` and ensure **n8n Preview** is enabled.
4. **Fully refresh the wiki tab** before opening the editor. Closing and reopening the editor does not replace block code already loaded in the tab.

The preview-server address is fixed in the package. Open the block's **Parameters** to see it in the hint under Workflow JSON URL. It is informational text, not an editable field. Maintainers select their server using build-time `N8N_PREVIEW_URL` in a local `.env` file; without a configured value, builds use `https://n8n-preview-service.internal.n8n.cloud/workflows/demo`. If the address must change, follow [Changing the preview server](BUILDING.md#changing-the-preview-server), rebuild the package, and reinstall it. Setting a variable on a running Wiki.js container does not change that packaged address. Check the displayed server before using the block; availability of the default service is not guaranteed.

## Add a workflow to a page

Use **Insert Block / the block picker → n8n Preview**, then choose **one** of the following input methods. Slash-menu availability depends on the editor and has not been verified; the block picker is the supported path.

### Option 1: paste JSON into Content

1. Open **Parameters** and leave **Workflow JSON URL** blank.
2. Open **Content / Edit Content**.
3. Paste the complete workflow JSON object, including `nodes` and `connections`.
4. Click **Apply**, then save the page.

**Do not include triple backticks in the Content code editor.** Wiki.js manages the code fence. For a first test, paste the contents of `fixtures/sanitized-workflow.json`.

If editing the page's raw Markdown source instead, the body inside the n8n Preview block must contain a fenced JSON code block:

````markdown
```json
{
  "nodes": [],
  "connections": {}
}
```
````

The small example validates but has no nodes to draw; use the fixture or a sanitized workflow for a visible diagram.

### Option 2: use a Wiki.js asset

1. Upload the workflow JSON through **Wiki.js Assets**.
2. Copy its **direct file/download URL**.
3. Open **Parameters** and enter that address in **Workflow JSON URL**.
4. Leave **Content** empty (an empty JSON fence is fine), then apply and save.

The file must be on the **same origin as the wiki** and accessible to the reader. Use the full asset URL or a root-relative path. An asset-management screen URL, wiki page URL, or local filesystem path is not a JSON download URL. Redirecting asset URLs are rejected; use a direct address.

Typing only `test.json` does not search Wiki.js Assets. It is a relative web path: on `/folder/page`, it resolves to `/folder/test.json`. A `.json` URL can still return HTML; check the actual response if validation fails.

### Parameters and downloads

| Parameter | Purpose |
| --- | --- |
| **Workflow JSON URL** | Direct asset URL; blank when using Content. Its hint also shows the fixed preview-server address and rebuild reminder. |
| **Debug logging** | Off by default. Enable for a visible success message and non-sensitive console diagnostics. Errors remain visible when it is off. |
| **Preview height** | Default 500 px, limited to 200–1200 px. |

Use **Download workflow JSON** below the diagram to get the workflow. In asset mode, the link targets the uploaded file; in Content mode, it downloads a JSON file generated from the validated workflow. Browser settings and server download headers can affect whether it opens or downloads and which filename is used.

## Data and access

**The complete workflow JSON is sent to the configured n8n preview server.** The block does not sanitize it, and rendering is not fully local.

Use exports without credentials, tokens, private endpoints, webhook identifiers, pinned data, or sensitive metadata. JSON pasted into Content is stored with the wiki page and can appear in source, history, and exports. Uploaded asset permissions may differ from page permissions; check both.

The intended experience is a read-only diagram with zoom and pan. Read-only behavior must be enforced by the preview server; an iframe alone cannot prevent workflow execution.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| **Blank or outdated preview after installation** | Fully refresh the browser tab. Check the status/error above the preview. |
| **Missing or conflicting workflow source** | Provide either Content JSON or a URL, not both. Click Apply in Content before saving. |
| **Invalid JSON / HTML response** | Use a complete workflow export. For assets, inspect the direct URL as the intended reader: it must return JSON, not a wiki page or login page. Renaming an HTML download to `.json` will not fix it. |
| **Readiness timeout / no diagram** | Confirm `N8N_PREVIEW_MODE=true` on n8n, the configured address ends at the correct `/workflows/demo` page, and the endpoint is reachable. Check n8n version compatibility and allowed message origins. |
| **Login, 401, or network errors** | Open the preview endpoint directly and inspect n8n's logs. The remote preview may require separate authentication; third-party cookie restrictions can interfere. Wiki asset credentials do not authenticate the iframe. |
| **Framing / CSP error** | Ask the administrator to check preview X-Frame-Options/CSP frame-ancestors and wiki frame-src/connect-src policies. JavaScript cannot bypass these policies. |
| **No console messages** | Expected with Debug logging off. Enable it in Parameters for diagnostic events. |
| **Block missing from picker or slash menu** | Check installation, enabled state, site, permissions, and editor refresh. Use the picker if the slash menu does not list it. |

An iframe load event does not prove the diagram rendered. A ready-message timeout can indicate a login page, framing restriction, or incompatible preview protocol. Do not share workflow secrets, cookies, or sensitive URL query parameters when requesting help.

## Updates, removal, and backups

Reinstall a package with the same block key to update it, then fully refresh open wiki tabs. Preserve the previous package for rollback. Remove usages from pages before disabling or deleting the block; saving a page while a block is disabled may strip its markup.

The reviewed Wiki.js 3.3.1 implementation stores installed packages in its database and regenerates serving caches. Verify persistence after container recreation and backup/restore on your exact image. Back up the database, page content, workflow asset storage, and installed package/configuration. Do not assume a page-only export includes installed block packages.

## Maintainer information

See **[BUILDING.md](BUILDING.md)** for prerequisites, pinned Wiki.js tooling, exact build/test commands, preview-server changes, implementation details, optional multiline editor-header CSS, and the deployment acceptance checklist.
