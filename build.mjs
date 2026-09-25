// Build script: bundles src/index.ts into ESM / CJS / UMD (IIFE) + emits .d.ts via tsc.
//
// The plugin deliberately imports @antv/x6 as *types only*, so every bundle has zero runtime
// dependencies and works both with a bundler and with the X6 UMD build loaded as a global.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  target: ['es2018'],
  logLevel: 'info',
  // no externals on purpose: types-only import means nothing to externalise
}

await build({
  ...shared,
  format: 'esm',
  outfile: 'dist/index.mjs',
})

await build({
  ...shared,
  format: 'cjs',
  outfile: 'dist/index.cjs',
})

await build({
  ...shared,
  format: 'iife',
  globalName: 'X6PluginPortEditor',
  outfile: 'dist/index.umd.js',
})

execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' })
