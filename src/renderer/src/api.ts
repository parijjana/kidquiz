/**
 * Thin typed re-export of the frozen `window.kidquiz` preload API, plus small
 * renderer-side convenience hooks. Nothing here talks to `ipcRenderer`
 * directly — see src/preload/index.ts (out of scope for this agent).
 */
import { useEffect, useRef } from 'react'
import type { KidquizEventName, KidquizEventPayloadMap } from '@shared/types'

/** The full `window.kidquiz` API, re-exported for convenient importing. */
export const api = window.kidquiz

export default api

/**
 * Subscribe to a `window.kidquiz` push event for the lifetime of the
 * component. The handler is always the latest render's closure (no stale
 * closures), but subscribing/unsubscribing only happens when `eventName`
 * changes, not on every render.
 */
export function useKidquizEvent<K extends KidquizEventName>(
  eventName: K,
  handler: (payload: KidquizEventPayloadMap[K]) => void
): void {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const listener = (payload: KidquizEventPayloadMap[K]): void => handlerRef.current(payload)
    api.on(eventName, listener)
    return () => api.off(eventName, listener)
  }, [eventName])
}
