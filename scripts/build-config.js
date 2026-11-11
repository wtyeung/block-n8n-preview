import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { PREVIEW_URL as DEFAULT_PREVIEW_URL } from '../block-n8n-preview/preview.js'

export function resolvePreviewUrl(env = {}, fileEnv = {}) {
  const value = (env.N8N_PREVIEW_URL ?? fileEnv.N8N_PREVIEW_URL ?? '').trim() || DEFAULT_PREVIEW_URL
  let endpoint
  try { endpoint = new URL(value) } catch { throw new Error('N8N_PREVIEW_URL must be a valid HTTP(S) URL.') }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('N8N_PREVIEW_URL must be an HTTP(S) URL without embedded credentials.')
  }
  return endpoint.href
}

export function injectPreviewUrl(source, url) {
  const declaration = /^export const PREVIEW_URL = [^\r\n]+$/gm
  if ([...source.matchAll(declaration)].length !== 1) throw new Error('Expected one preview URL declaration in the preview module.')
  return source.replace(declaration, () => `export const PREVIEW_URL = ${JSON.stringify(url)}`)
}

export async function loadPreviewUrl({ env = process.env, envFile = new URL('../.env', import.meta.url) } = {}) {
  let fileEnv = {}
  try {
    fileEnv = parseEnv(await readFile(envFile, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Unable to read the build-time .env configuration.')
  }
  return resolvePreviewUrl(env, fileEnv)
}
