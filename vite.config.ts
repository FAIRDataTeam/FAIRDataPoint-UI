/// <reference types="vitest/config" />

import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, ViteDevServer } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import svgLoader from 'vite-svg-loader'

import { version } from './package.json'

// https://vite.dev/config/
export default defineConfig({
  // plugin order matters
  plugins: [vue(), svgLoader(), vueDevTools(), clientConfigOverridePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  // vitest options
  test: {
    // Setup files run before each test file, in the same process (unlike globalSetup)
    setupFiles: ['./tests/vitest.setup.ts'],
  },
})

/**
 * This plugin configures the Vite development server to rewrite the `/config.json` URL to `/config.local.json`
 * *if* a `public/config.local.json` file exists.
 *
 * @remarks
 *
 * - This is only intended for developers who want to override the default `public/config.json` file locally.
 * - The optional `config.local.json` file is excluded from version control (see `.gitignore`).
 *
 * @privateRemarks
 *
 * Relevant documentation can be found here:
 * - {@link https://vite.dev/guide/api-plugin#configureserver configureServer docs}
 * - {@link https://vite.dev/guide/api-javascript#vitedevserver ViteDevServer docs}
 * - {@link https://github.com/senchalabs/connect#use-middleware server.middlewares docs}
 */
function clientConfigOverridePlugin() {
  return {
    name: 'client-config-override',
    configureServer(server: ViteDevServer) {
      const overrideUrlPath = '/config.local.json'
      const overrideFilePath: string = path.resolve(process.cwd(), 'public' + overrideUrlPath)
      // rewrite url path if local override file exists
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/config.json' && fs.existsSync(overrideFilePath)) {
          console.warn('Using config override from %s', overrideFilePath)
          req.url = overrideUrlPath
        }
        next()
      })
    },
  }
}
