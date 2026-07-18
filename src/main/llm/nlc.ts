/**
 * Runtime loader for node-llama-cpp.
 *
 * node-llama-cpp v3 is ESM-only and uses top-level await, so it cannot be pulled in via a
 * CommonJS `require()` — which is exactly what a static `import ... from 'node-llama-cpp'`
 * compiles to in electron-vite's CJS main-process bundle (the package is a Rollup external).
 * That crashes at runtime with `ERR_REQUIRE_ASYNC_MODULE`.
 *
 * A dynamic `import()` is preserved as a native `import()` in the CJS bundle
 * (Rollup's default `dynamicImportInCjs`), and a native `import()` CAN load a TLA ESM graph.
 * This memoizes that dynamic import so the module is loaded at most once.
 *
 * Usage: `const { getLlama } = await nlc()` inside an async function. Keep all *type-only*
 * imports as `import type { ... } from 'node-llama-cpp'` elsewhere — those are erased at
 * compile time and never emit a require().
 */

let modPromise: Promise<typeof import('node-llama-cpp')> | null = null

export function nlc(): Promise<typeof import('node-llama-cpp')> {
  return (modPromise ??= import('node-llama-cpp'))
}
