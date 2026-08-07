import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

/**
 * Content-Security-Policy for the packaged renderer.
 *
 * The renderer makes no network requests of its own — every Canvas and Google call happens
 * in the main process and arrives over IPC — so `connect-src 'none'` costs nothing and means
 * injected script has nowhere to send what it steals. That containment is the point: it is
 * what keeps a renderer-side flaw from becoming an exfiltration route.
 *
 * `style-src` needs 'unsafe-inline' because React writes `style={{…}}` as inline style
 * attributes (the draggable title bar, the tile colours, the progress bar width). `img-src`
 * allows the Google profile picture and the data: URIs Vite inlines for small assets.
 *
 * Injected at build time only. The dev server needs a websocket for HMR and serves inline
 * module scripts, so applying this policy there would just break `npm run dev` — and dev is
 * developer-only, where the threat model does not apply.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // Any *.googleusercontent.com host: profile pictures come back from lh3, lh4, lh5 and
  // others depending on the account, so pinning one subdomain would silently drop the
  // avatar for some users and fall back to initials with no clue why.
  "img-src 'self' data: https://*.googleusercontent.com",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      )
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
    server: {
      watch: {
        // Once electron-builder has run, `release/` holds ~77 MB of packaged Electron files.
        // Watching them makes the dev server fire an endless HMR reload storm on
        // release/win-unpacked/LICENSES.chromium.html. Nothing in there is a source file.
        ignored: ['**/release/**', '**/out/**'],
      },
    },
    plugins: [react(), cspPlugin()],
    css: {
      postcss: './postcss.config.js',
    },
  },
})
