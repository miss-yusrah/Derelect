import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)

/**
 * The NEAR wallet connector is OPTIONAL at build time: when the package is
 * present Vite resolves it normally; when missing we alias the bare specifier
 * onto a local stub so the build and the guarded dynamic import in
 * src/lib/near.ts keep working (the UI reports that wallet signing is
 * unavailable).
 */
function probe(id: string): boolean {
  try {
    require_.resolve(id)
    return true
  } catch {
    return false
  }
}

const gameModelEntry = resolve(here, '../../packages/game-model/src/index.ts')

const resolveEntries: Array<{ find: string | RegExp; replacement: string }> = [
  // Alias @derelict/game-model to its TS source so HMR and tsc share one truth.
  { find: '@derelict/game-model', replacement: gameModelEntry },
]
if (!probe('@hot-labs/near-connect')) {
  resolveEntries.push({
    find: /^@hot-labs\/near-connect$/,
    replacement: resolve(here, 'src/vendor/near-connect-stub.js'),
  })
}

export default defineConfig((): UserConfig => ({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  resolve: { alias: resolveEntries },
  define: {
    __DERELICT_NEAR_CONNECT__: JSON.stringify(probe('@hot-labs/near-connect')),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
  },
}))
