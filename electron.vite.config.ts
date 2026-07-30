import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

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
    plugins: [react()],
    css: {
      postcss: './postcss.config.js',
    },
  },
})
