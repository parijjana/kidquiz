/**
 * Tiny module-level store for the child's optional first name, entered on
 * `QuizPicker` and read by `QuizPlayer` when recording an attempt.
 *
 * This intentionally is NOT a `Route` field — the route union
 * (`router/RouterContext.tsx`) is frozen and carries no name — and it is
 * NOT persisted to disk. It lives for the lifetime of the renderer
 * (i.e. "the session") and is shared by every kid-area screen via plain
 * module-scope state, which survives each screen unmounting/remounting as
 * the hand-rolled router swaps components in and out.
 */
let childName: string | null = null

/** The name the child typed on `QuizPicker`, or `null` if left blank. */
export function getChildName(): string | null {
  return childName
}

/** `null`/empty/whitespace-only clears the stored name. */
export function setChildName(name: string | null): void {
  const trimmed = name?.trim() ?? ''
  childName = trimmed.length > 0 ? trimmed : null
}
