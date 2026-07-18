/**
 * Ambient module declaration for vite's `?raw` import suffix, used to bundle
 * schema.sql as a string into the main build. (vite/client.d.ts declares the
 * same thing, but it isn't in this project's restricted `types` array, so we
 * declare it locally.)
 */
declare module '*.sql?raw' {
  const content: string
  export default content
}
