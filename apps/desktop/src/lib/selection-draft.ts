/**
 * The unsent draft a selection opens: an exact quote plus where it came from.
 *
 * Two doors share this shape: text selected in a Hermes message (internal) and
 * text handed over by the macOS Services menu (native). Both produce a draft
 * that is ONLY placed in a fresh composer, never sent; the person adds their
 * question and sends it themselves. Only the selection travels — the source
 * conversation is referenced by a link, its history is never copied.
 */

import { quoteLines } from './selection-markdown'

/** Large enough for a long reply or a page section, small enough that a
 *  stray ⌘A over a huge document does not freeze the composer. */
export const MAX_SELECTION_DRAFT_CHARS = 100_000

export type SelectionMessageRole = 'assistant' | 'user'

export interface HermesSelectionSource {
  kind: 'hermes'
  role: SelectionMessageRole
  /** Durable stored session id of the conversation the quote came from. */
  sessionId: null | string
  /** Session title as shown in the sidebar; empty when untitled. */
  title: string
  /** `hermes://open/<id>` style link back to the conversation. */
  link: null | string
}

export interface NativeSelectionSource {
  kind: 'native'
  appName: string
  bundleId: string
  /** Front browser tab URL — only present when the user opted in to it. */
  url: string
  /** Front document path — only present when the user opted in to it. */
  document: string
}

export type SelectionSource = HermesSelectionSource | NativeSelectionSource

export interface SelectionDraftCopy {
  /** e.g. "assistant message" / "your message". */
  roleLabel: (role: SelectionMessageRole) => string
  /** Source line for a quote taken from a Hermes conversation. */
  hermesSource: (args: { role: string; title: string; link: string }) => string
  /** Source line for a quote handed over from another macOS app. */
  nativeSource: (args: { app: string; location: string }) => string
  untitledConversation: string
}

export type SelectionDraftResult =
  { ok: true; draft: string } | { ok: false; reason: 'empty' } | { ok: false; reason: 'tooLarge'; length: number }

/**
 * Line endings unified and blank edge lines dropped; everything between the
 * first and the last non-blank line is kept byte-for-byte (indentation, inner
 * blank lines, trailing spaces of a code line).
 */
export function normalizeSelectionText(raw: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const first = lines.findIndex(line => line.trim().length > 0)

  if (first === -1) {
    return ''
  }

  let last = lines.length - 1

  while (last > first && !lines[last]!.trim()) {
    last -= 1
  }

  return lines.slice(first, last + 1).join('\n')
}

/** `hermes://open/<id>` (or the dev scheme): the deep link the app already
 *  routes to an in-app path, here the session route. */
export function hermesSessionLink(protocol: string, sessionId: string): string {
  return `${protocol}://open/${encodeURIComponent(sessionId)}`
}

function sourceLine(source: SelectionSource, copy: SelectionDraftCopy): string {
  if (source.kind === 'hermes') {
    return copy.hermesSource({
      role: copy.roleLabel(source.role),
      title: source.title.trim() || copy.untitledConversation,
      link: source.link ?? ''
    })
  }

  const app = [source.appName.trim(), source.bundleId.trim() ? `(${source.bundleId.trim()})` : '']
    .filter(Boolean)
    .join(' ')

  return copy.nativeSource({ app, location: source.url.trim() || source.document.trim() })
}

/**
 * The draft text: the quote, a blank line, the source line, and a trailing
 * blank line for the question the person types next.
 */
export function formatSelectionDraft(
  markdown: string,
  source: SelectionSource,
  copy: SelectionDraftCopy
): SelectionDraftResult {
  const text = normalizeSelectionText(markdown)

  if (!text) {
    return { ok: false, reason: 'empty' }
  }

  if (text.length > MAX_SELECTION_DRAFT_CHARS) {
    return { ok: false, reason: 'tooLarge', length: text.length }
  }

  return { ok: true, draft: `${quoteLines(text)}\n\n${sourceLine(source, copy)}\n\n` }
}
