/**
 * "Open this text in a new chat" requests.
 *
 * Producers (the transcript context menu, the keybind, the macOS Services
 * bridge) only describe the draft; the session layer that owns
 * `startFreshSessionDraft` consumes the request (`useSelectionDraftRequests`).
 * The draft is seeded into the NEW fresh-draft bucket before the composer
 * swaps scope, so it lands in the new chat's composer and nowhere else — and
 * nothing ever sends it.
 */

import { atom } from 'nanostores'

import { rotateFreshDraftKey, stashSessionDraft } from './composer'

export interface SelectionDraftRequest {
  id: number
  text: string
}

export const $selectionDraftRequest = atom<null | SelectionDraftRequest>(null)

let requestCounter = 0

export function requestSelectionDraft(text: string): void {
  requestCounter += 1
  $selectionDraftRequest.set({ id: requestCounter, text })
}

/**
 * Seed a brand-new fresh-draft bucket with `text` and return its key. The
 * caller then starts the fresh draft WITHOUT rotating again, so the composer
 * swaps onto exactly this bucket and loads the text from it.
 */
export function seedFreshSelectionDraft(text: string): string {
  const key = rotateFreshDraftKey()
  stashSessionDraft(key, text, [])

  return key
}

/** Take the pending request (idempotent per id). */
export function takeSelectionDraftRequest(id: number): null | SelectionDraftRequest {
  const current = $selectionDraftRequest.get()

  if (!current || current.id !== id) {
    return null
  }

  $selectionDraftRequest.set(null)

  return current
}
