/**
 * Which transcript text is selected, resolved from the live DOM selection.
 *
 * The one place that decides whether a selection may open a new chat: it must
 * lie inside ONE user or assistant message of ONE chat surface. A selection
 * that spills into a second message, the composer, the sidebar or tool chrome
 * is refused with a reason the caller can show — never widened into "the
 * whole conversation".
 */

import type { SelectionMessageRole } from '@/lib/selection-draft'
import { rangeToMarkdown } from '@/lib/selection-markdown'
import { $selectedStoredSessionId } from '@/store/session'

/** Message roots carry `data-role` (thread/assistant-message.tsx, user-message.tsx). */
export const TRANSCRIPT_MESSAGE_SELECTOR = '[data-role="assistant"], [data-role="user"]'

/** Every chat surface (primary and tiles) marks its root; see app/chat/index.tsx. */
export const CHAT_SURFACE_SELECTOR = '[data-chat-surface]'

/** Surface dock anchor (app/chat/index.tsx): `workspace` for the primary, `session-tile:<id>` for a tile. */
const TILE_ANCHOR_PREFIX = 'session-tile:'

/** Stored session id of the chat surface a message renders in. */
export function surfaceSessionId(surface: Element | null): null | string {
  if (!surface) {
    return null
  }

  const anchor = surface.getAttribute('data-session-anchor') ?? ''

  return anchor.startsWith(TILE_ANCHOR_PREFIX)
    ? anchor.slice(TILE_ANCHOR_PREFIX.length) || null
    : $selectedStoredSessionId.get()
}

export type TranscriptSelection =
  | {
      kind: 'message'
      /** The selection as Markdown (formatting the reader saw). */
      markdown: string
      /** The selection as plain text (what ⌘C copies). */
      text: string
      role: SelectionMessageRole
      sessionId: null | string
      message: Element
    }
  | { kind: 'none' }
  | { kind: 'outside' }
  | { kind: 'multiple' }

function elementOf(node: Node | null): Element | null {
  return node instanceof Element ? node : (node?.parentElement ?? null)
}

function messageOf(node: Node | null): Element | null {
  return elementOf(node)?.closest(TRANSCRIPT_MESSAGE_SELECTOR) ?? null
}

function isEditableNode(node: Node | null): boolean {
  const element = elementOf(node)

  return Boolean(element?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]'))
}

/** The selection's own verdict. Pure over the `Selection` handed in. */
export function resolveTranscriptSelection(
  selection: Selection | null = typeof window === 'undefined' ? null : window.getSelection()
): TranscriptSelection {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { kind: 'none' }
  }

  const text = selection.toString()

  if (!text.trim()) {
    return { kind: 'none' }
  }

  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
  const first = ranges[0]!
  const message = messageOf(first.startContainer)

  if (!message) {
    return { kind: 'outside' }
  }

  for (const range of ranges) {
    for (const node of [range.startContainer, range.endContainer]) {
      if (isEditableNode(node)) {
        return { kind: 'outside' }
      }

      const owner = messageOf(node)

      if (!owner) {
        return { kind: 'outside' }
      }

      if (owner !== message) {
        return { kind: 'multiple' }
      }
    }
  }

  const surface = message.closest(CHAT_SURFACE_SELECTOR)
  const role: SelectionMessageRole = message.getAttribute('data-role') === 'user' ? 'user' : 'assistant'
  const markdown = ranges.map(range => rangeToMarkdown(range, message)).join('\n\n')

  return {
    kind: 'message',
    markdown: markdown.trim() ? markdown : text,
    text,
    role,
    sessionId: surfaceSessionId(surface),
    message
  }
}

/**
 * The selection as it was when a right-button press began.
 *
 * Chromium moves the selection on the press itself — a right-click beside the
 * highlight (line end, gap between words, the message padding) collapses it
 * before `contextmenu` is dispatched. The app menu then saw no selection and
 * fell back to the zone menu (Reload / Close tabs): the menu the person got
 * when they right-clicked "at" their selection. Snapshotting on the press lets
 * the menu answer for the selection the person was looking at.
 */
export interface SelectionSnapshot {
  ranges: Range[]
  message: Element
  takenAt: number
}

/** A snapshot is honoured only for the gesture that took it. */
export const SELECTION_SNAPSHOT_TTL_MS = 1500

export function snapshotTranscriptSelection(
  selection: Selection | null = window.getSelection(),
  now = Date.now()
): null | SelectionSnapshot {
  const resolved = resolveTranscriptSelection(selection)

  if (resolved.kind !== 'message' || !selection) {
    return null
  }

  return {
    ranges: Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()),
    message: resolved.message,
    takenAt: now
  }
}

/**
 * Put the snapshot back when the click that collapsed it landed in the same
 * message. Returns whether the live selection is the snapshot again.
 */
export function restoreSnapshotForClick(
  snapshot: null | SelectionSnapshot,
  clicked: Element | null,
  selection: Selection | null = window.getSelection(),
  now = Date.now()
): boolean {
  if (!snapshot || !clicked || !selection || now - snapshot.takenAt > SELECTION_SNAPSHOT_TTL_MS) {
    return false
  }

  if (!snapshot.message.isConnected || !snapshot.message.contains(clicked)) {
    return false
  }

  if (resolveTranscriptSelection(selection).kind === 'message') {
    return false
  }

  selection.removeAllRanges()

  for (const range of snapshot.ranges) {
    selection.addRange(range)
  }

  return resolveTranscriptSelection(selection).kind === 'message'
}
