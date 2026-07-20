/// <reference types="vitest/config" />

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, ViteDevServer } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import svgLoader from 'vite-svg-loader'

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
    __APP_VERSION__: JSON.stringify(gitDescribeVersion()),
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

/**
 * Returns a version string obtained from `git describe`, in long format, for example, `'v1.2.3-0-gfc7760f'`.
 * Fails intentionally if the `git describe` call fails or if its output is falsy.
 */
function gitDescribeVersion(): string {
  const { stdout, stderr, status } = spawnSync(
    'git',
    [
      'describe',
      '--tags', // include the lightweight tags created by e.g. github
      '--always', // use abbreviated commit hash if there are no tags at all
      '--long', // use long format even if the current commit is tagged ('v1.2.3-0-gfc7760f' instead of 'v1.2.3')
    ],
    { encoding: 'utf8' },
  )
  assert(stdout, `git describe call failed (exit code: ${status}, stderr: ${stderr?.trim()})`)
  return stdout.trim()
}
