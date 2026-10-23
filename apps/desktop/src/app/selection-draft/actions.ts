/**
 * The two doors into "new chat from selected text".
 *
 *  - Inside Hermes: the transcript selection (context menu item or the
 *    `session.newFromSelection` keybind).
 *  - macOS Services: text another app handed to the installed Service, relayed
 *    by main as a validated payload.
 *
 * Both format the same quote + source draft and file one request; neither ever
 * sends. A refusal (nothing selected, a selection outside a single message, an
 * oversized selection, an expired hand-off) is said out loud, never swallowed.
 */

import { runtimeTranslations } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import {
  formatSelectionDraft,
  hermesSessionLink,
  type SelectionDraftCopy,
  type SelectionDraftResult,
  type SelectionSource
} from '@/lib/selection-draft'
import { notify } from '@/store/notifications'
import { requestSelectionDraft } from '@/store/selection-draft'
import { $sessions } from '@/store/session'

import { resolveTranscriptSelection, type TranscriptSelection } from './transcript-selection'

/** What main relays from the Services hand-off (electron/selection-service.ts). */
export interface NativeSelectionDraftPayload {
  ok: boolean
  error?: 'empty' | 'expired' | 'invalid' | 'missing' | 'tooLarge'
  /** Character count of a refused oversized hand-off. */
  length?: number
  text?: string
  source?: { appName?: string; bundleId?: string; url?: string; document?: string }
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/

export function deepLinkProtocol(): string {
  const value = window.hermesDesktop?.deepLinkProtocol

  return typeof value === 'string' && SCHEME_RE.test(value) ? value : 'hermes'
}

function draftCopy(): SelectionDraftCopy {
  const copy = runtimeTranslations().selectionDraft

  return {
    roleLabel: role => (role === 'user' ? copy.roleUser : copy.roleAssistant),
    hermesSource: copy.hermesSource,
    nativeSource: copy.nativeSource,
    untitledConversation: copy.untitledConversation
  }
}

function refuse(message: string): false {
  const copy = runtimeTranslations().selectionDraft

  // One id: repeated refusals replace each other instead of stacking.
  notify({ id: 'selection-draft-refused', kind: 'warning', title: copy.refusedTitle, message })

  return false
}

function deliver(result: SelectionDraftResult): boolean {
  const copy = runtimeTranslations().selectionDraft

  if (!result.ok) {
    return refuse(result.reason === 'tooLarge' ? copy.tooLarge(result.length) : copy.noSelection)
  }

  requestSelectionDraft(result.draft)

  return true
}

function titleFor(sessionId: null | string): string {
  const session = sessionId ? $sessions.get().find(row => row.id === sessionId) : undefined

  return session ? sessionTitle(session) : ''
}

/** Open the current (or given) transcript selection in a new unsent draft. */
export function openTranscriptSelectionInNewDraft(
  selection: TranscriptSelection = resolveTranscriptSelection()
): boolean {
  const copy = runtimeTranslations().selectionDraft

  if (selection.kind === 'none') {
    return refuse(copy.noSelection)
  }

  if (selection.kind === 'outside') {
    return refuse(copy.outsideMessage)
  }

  if (selection.kind === 'multiple') {
    return refuse(copy.multipleMessages)
  }

  const source: SelectionSource = {
    kind: 'hermes',
    role: selection.role,
    sessionId: selection.sessionId,
    title: titleFor(selection.sessionId),
    link: selection.sessionId ? hermesSessionLink(deepLinkProtocol(), selection.sessionId) : null
  }

  return deliver(formatSelectionDraft(selection.markdown, source, draftCopy()))
}

/** Open text handed over by the macOS Service in a new unsent draft. */
export function openNativeSelectionDraft(payload: NativeSelectionDraftPayload): boolean {
  const copy = runtimeTranslations().selectionDraft

  if (!payload.ok) {
    const reason = payload.error ?? 'invalid'

    return refuse(
      reason === 'empty'
        ? copy.nativeEmpty
        : reason === 'tooLarge'
          ? copy.tooLarge(payload.length ?? 0)
          : copy.nativeExpired
    )
  }

  const source: SelectionSource = {
    kind: 'native',
    appName: payload.source?.appName ?? '',
    bundleId: payload.source?.bundleId ?? '',
    url: payload.source?.url ?? '',
    document: payload.source?.document ?? ''
  }

  const result = formatSelectionDraft(payload.text ?? '', source, draftCopy())

  if (!result.ok && result.reason === 'empty') {
    return refuse(copy.nativeEmpty)
  }

  return deliver(result)
}
