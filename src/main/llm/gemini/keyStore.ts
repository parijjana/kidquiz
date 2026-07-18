/**
 * Gemini API key storage — encrypted at rest with Electron `safeStorage` (DPAPI on Windows,
 * Keychain on macOS). See ARCHITECTURE.md §13.
 *
 * The key lives in `<dataRoot()>/gemini-key.enc` (next to the exe for the portable build) so
 * the user can see and delete it. Every read is defensive: a missing, corrupt, or
 * undecryptable file — or `safeStorage` being unavailable — yields "no key" and NEVER throws.
 * Gemini is an optional enhancement; it must fail silently to the un-configured state.
 */

import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GeminiStatus } from '@shared/types'
import { dataRoot } from '../../paths'

const KEY_FILE_NAME = 'gemini-key.enc'

function keyFilePath(): string {
  return join(dataRoot(), KEY_FILE_NAME)
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * The decrypted API key, or `null`. Returns `null` — never throws — when encryption is
 * unavailable, the file is missing, or the file cannot be decrypted (corrupt / wrong OS user).
 */
export function getKey(): string | null {
  try {
    if (!encryptionAvailable()) return null
    const path = keyFilePath()
    if (!existsSync(path)) return null
    const decrypted = safeStorage.decryptString(readFileSync(path)).trim()
    return decrypted.length > 0 ? decrypted : null
  } catch {
    return null
  }
}

/** Current key status for the Settings UI (see `GeminiStatus`). */
export function getStatus(): GeminiStatus {
  return {
    keyPresent: getKey() !== null,
    keyFilePath: keyFilePath(),
    encryptionAvailable: encryptionAvailable()
  }
}

/**
 * Validate, encrypt, and store a Gemini API key, returning the fresh status.
 *
 * Validation is a lightweight GET to the models endpoint:
 * - HTTP 400/401/403 → the key is bad; reject with a friendly message.
 * - Network failure → we can't verify while offline, which is NOT an error: save anyway.
 * - Any other response → accept (can't disprove the key).
 *
 * @throws if the key is empty, if OS encryption is unavailable, or if the key is rejected.
 */
export async function setKey(rawKey: string): Promise<GeminiStatus> {
  const key = rawKey.trim()
  if (key.length === 0) {
    throw new Error('Please paste your Gemini API key.')
  }
  if (!encryptionAvailable()) {
    throw new Error(
      "This computer can't securely store the key (no OS encryption available), so Gemini can't be enabled here."
    )
  }

  await validateKey(key)

  writeFileSync(keyFilePath(), safeStorage.encryptString(key))
  return getStatus()
}

async function validateKey(key: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { method: 'GET' }
    )
  } catch {
    // Offline / unreachable — cannot verify, but this is not a reason to reject the key.
    return
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new Error("That key doesn't seem to work — please copy it again.")
  }
}

/** Delete the stored key file if present (missing file is fine), returning fresh status. */
export function deleteKey(): GeminiStatus {
  try {
    const path = keyFilePath()
    if (existsSync(path)) rmSync(path, { force: true })
  } catch {
    // Best-effort deletion; still report status below.
  }
  return getStatus()
}
