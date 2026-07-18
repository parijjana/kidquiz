/**
 * Gemini REST client — structured (JSON) generation via the free-tier Flash model.
 * See ARCHITECTURE.md §13. Uses the global `fetch` (Electron main / Node 22); no new deps.
 *
 * - Output is constrained with `generationConfig.responseMimeType: 'application/json'` plus a
 *   `responseSchema` translated from our GBNF-subset JSON schema into Gemini's OpenAPI-style
 *   schema dialect (see `toGeminiSchema`).
 * - Client-side rate limiting: a module-level min-interval gate sized for free-tier RPM,
 *   awaited before every request.
 * - 429: honour `Retry-After` header or `RetryInfo` detail (capped), retry up to twice, then
 *   throw {@link GeminiQuotaError}. Network failures throw {@link GeminiNetworkError}. Auth /
 *   bad-request failures throw {@link GeminiAuthError}. These distinct classes let the provider
 *   decide when to fall back to local inference.
 */

/**
 * Current recommended stable free-tier Flash model id.
 * Verified 2026-07 against Google's official docs (ai.google.dev/gemini-api/docs/models and
 * .../docs/pricing) — both list `gemini-3.5-flash` as a current stable model with a free tier.
 */
const GEMINI_FLASH_MODEL = 'gemini-3.5-flash'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Minimum spacing between requests, sized for the free-tier RPM (~9-10 req/min). */
const MIN_REQUEST_INTERVAL_MS = 6_500
/** Upper bound on how long we'll wait for a 429 Retry-After before giving up on that wait. */
const MAX_RETRY_WAIT_MS = 30_000
/** Max 429 retries before surfacing a quota error. */
const MAX_RETRIES = 2

/** Free-tier quota exhausted (persistent 429). The provider treats this as "fall back to local". */
export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiQuotaError'
  }
}

/** Network failure or unexpected server error reaching Gemini. Triggers local fallback. */
export class GeminiNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiNetworkError'
  }
}

/** Key / request rejected (HTTP 400/401/403). Triggers local fallback (usually a bad key). */
export class GeminiAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiAuthError'
  }
}

// ---------------------------------------------------------------------------
// Rate-limit gate (module-level, serialised)
// ---------------------------------------------------------------------------

let nextAllowedAt = 0
let gateChain: Promise<void> = Promise.resolve()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolve when it's safe to make the next request; reserves this request's slot. */
function rateLimitGate(): Promise<void> {
  gateChain = gateChain.then(async () => {
    const wait = nextAllowedAt - Date.now()
    if (wait > 0) await delay(wait)
    nextAllowedAt = Date.now() + MIN_REQUEST_INTERVAL_MS
  })
  return gateChain
}

// ---------------------------------------------------------------------------
// Schema translation: GBNF-subset JSON schema -> Gemini (OpenAPI 3.0 subset) schema
// ---------------------------------------------------------------------------

interface GeminiSchema {
  type?: string
  enum?: string[]
  items?: GeminiSchema
  properties?: Record<string, GeminiSchema>
  required?: string[]
  minItems?: number
  maxItems?: number
  nullable?: boolean
}

/**
 * Translate the JSON schema we use for local GBNF grammars into Gemini's `responseSchema`
 * dialect (uppercase type names). Supports the subset §6 uses: object/array/string/integer/
 * number/boolean, `enum`, `const`, `properties`, `required`, `items`, `min/maxItems`, and a
 * `["x","null"]` nullable union. Anything else throws — we never silently mis-shape the schema.
 */
export function toGeminiSchema(input: object): GeminiSchema {
  return translate(input as Record<string, unknown>, 'root')
}

function translate(node: Record<string, unknown>, path: string): GeminiSchema {
  if (Array.isArray(node.enum)) {
    if (!node.enum.every((v) => typeof v === 'string')) {
      throw new Error(`Gemini schema: only string enums are supported (at ${path}).`)
    }
    return { type: 'STRING', enum: node.enum as string[] }
  }
  if ('const' in node) {
    if (typeof node.const !== 'string') {
      throw new Error(`Gemini schema: only string const values are supported (at ${path}).`)
    }
    return { type: 'STRING', enum: [node.const] }
  }

  let typeName: string
  let nullable = false
  const rawType = node.type
  if (Array.isArray(rawType)) {
    nullable = rawType.includes('null')
    const nonNull = rawType.filter((t) => t !== 'null')
    if (nonNull.length !== 1) {
      throw new Error(`Gemini schema: unsupported union type (at ${path}).`)
    }
    typeName = String(nonNull[0])
  } else if (typeof rawType === 'string') {
    typeName = rawType
  } else {
    throw new Error(`Gemini schema: missing or invalid "type" (at ${path}).`)
  }

  switch (typeName) {
    case 'object': {
      const rawProps = (node.properties ?? {}) as Record<string, Record<string, unknown>>
      const properties: Record<string, GeminiSchema> = {}
      for (const [key, value] of Object.entries(rawProps)) {
        properties[key] = translate(value, `${path}.${key}`)
      }
      const required = Array.isArray(node.required)
        ? node.required.map(String)
        : Object.keys(properties)
      const out: GeminiSchema = { type: 'OBJECT', properties, required }
      if (nullable) out.nullable = true
      return out
    }
    case 'array': {
      if (typeof node.items !== 'object' || node.items === null) {
        throw new Error(`Gemini schema: array is missing "items" (at ${path}).`)
      }
      const out: GeminiSchema = {
        type: 'ARRAY',
        items: translate(node.items as Record<string, unknown>, `${path}[]`)
      }
      if (typeof node.minItems === 'number') out.minItems = node.minItems
      if (typeof node.maxItems === 'number') out.maxItems = node.maxItems
      if (nullable) out.nullable = true
      return out
    }
    case 'string':
      return nullable ? { type: 'STRING', nullable: true } : { type: 'STRING' }
    case 'integer':
      return nullable ? { type: 'INTEGER', nullable: true } : { type: 'INTEGER' }
    case 'number':
      return nullable ? { type: 'NUMBER', nullable: true } : { type: 'NUMBER' }
    case 'boolean':
      return nullable ? { type: 'BOOLEAN', nullable: true } : { type: 'BOOLEAN' }
    default:
      throw new Error(`Gemini schema: unsupported type "${typeName}" (at ${path}).`)
  }
}

// ---------------------------------------------------------------------------
// generateContent
// ---------------------------------------------------------------------------

/**
 * Generate a JSON object from Gemini, constrained by `jsonSchema`. Returns the parsed value
 * (typed `unknown` — the caller validates its shape). Throws {@link GeminiQuotaError},
 * {@link GeminiNetworkError}, {@link GeminiAuthError}, or a plain `Error` (blocked/empty/malformed).
 */
export async function geminiGenerateStructured(opts: {
  apiKey: string
  systemPrompt: string
  userPrompt: string
  jsonSchema: object
  temperature?: number
}): Promise<unknown> {
  const requestBody = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(opts.jsonSchema)
    }
  }
  const url = `${GEMINI_API_BASE}/models/${GEMINI_FLASH_MODEL}:generateContent`

  for (let attempt = 0; ; attempt++) {
    await rateLimitGate()

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify(requestBody)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new GeminiNetworkError(`Couldn't reach Gemini: ${message}`)
    }

    const rawText = await response.text().catch(() => '')
    let parsed: unknown
    if (rawText) {
      try {
        parsed = JSON.parse(rawText)
      } catch {
        parsed = undefined
      }
    }

    if (response.ok) {
      return extractJson(parsed)
    }

    if (response.status === 429) {
      if (attempt < MAX_RETRIES) {
        await delay(parseRetryDelayMs(response, parsed))
        continue
      }
      throw new GeminiQuotaError(
        'Gemini free-tier limit reached. Switching to the on-device model for the rest of this run.'
      )
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new GeminiAuthError(
        "That Gemini key doesn't seem to work — please check it in Settings."
      )
    }

    // 5xx and anything else unexpected: treat as a transient reachability problem so the
    // run can fall back to local rather than failing outright.
    throw new GeminiNetworkError(`Gemini returned an unexpected error (HTTP ${response.status}).`)
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractJson(parsed: unknown): unknown {
  // `parsed` is an untrusted HTTP-boundary JSON value; navigate it defensively.
  const body = parsed as any
  if (body?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request (${String(body.promptFeedback.blockReason)}).`)
  }
  const parts = body?.candidates?.[0]?.content?.parts
  const text: string = Array.isArray(parts)
    ? parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('')
    : ''
  if (text.length === 0) {
    throw new Error('Gemini returned an empty response.')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Gemini returned malformed JSON.')
  }
}

function parseRetryDelayMs(response: Response, parsed: unknown): number {
  const header = response.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS)
    const dateMs = Date.parse(header)
    if (!Number.isNaN(dateMs)) {
      return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_WAIT_MS)
    }
  }
  const details = (parsed as any)?.error?.details
  if (Array.isArray(details)) {
    for (const detail of details) {
      const retryDelay = detail?.retryDelay
      if (typeof retryDelay === 'string') {
        const match = retryDelay.match(/^([\d.]+)s$/)
        if (match) return Math.min(Number(match[1]) * 1000, MAX_RETRY_WAIT_MS)
      }
    }
  }
  return MIN_REQUEST_INTERVAL_MS
}
/* eslint-enable @typescript-eslint/no-explicit-any */
