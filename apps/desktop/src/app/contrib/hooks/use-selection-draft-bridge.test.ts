import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openNativeSelectionDraft, openTranscriptSelectionInNewDraft } from '@/app/selection-draft/actions'
import { freshDraftScope, takeSessionDraft } from '@/store/composer'
import { $notifications } from '@/store/notifications'
import { $selectionDraftRequest } from '@/store/selection-draft'

import { useSelectionDraftRequests } from './use-selection-draft-bridge'

const desktopWindow = window as unknown as { hermesDesktop?: Window['hermesDesktop'] }

function mountTranscript() {
  document.body.innerHTML = `
    <section data-chat-surface="" data-session-anchor="session-tile:sess-42">
      <div data-role="assistant"><p id="a">Alpha <strong>beta</strong> gamma.</p></div>
      <div data-role="user"><p id="u">user words</p></div>
    </section>`
}

function selectAll(id: string) {
  const node = document.getElementById(id)!
  const range = document.createRange()

  range.selectNodeContents(node)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
}

afterEach(() => {
  cleanup()
  $selectionDraftRequest.set(null)
  $notifications.set([])
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
  delete desktopWindow.hermesDesktop
})

describe('useSelectionDraftRequests', () => {
  it('seeds the quote into a NEW draft bucket before starting it, and never submits', () => {
    const before = freshDraftScope()
    const seen: { key: string; text: string }[] = []

    const start = vi.fn(() => {
      // At the moment the fresh draft starts, the rotated bucket already holds the quote.
      const key = freshDraftScope()

      seen.push({ key, text: takeSessionDraft(key).text })
    })

    renderHook(() => useSelectionDraftRequests(start))
    mountTranscript()
    selectAll('a')

    act(() => {
      expect(openTranscriptSelectionInNewDraft()).toBe(true)
    })

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith({ rotateFreshDraftKey: false })
    expect(seen[0]!.key).not.toBe(before)
    expect(seen[0]!.text).toMatch(/^> Alpha \*\*beta\*\* gamma\./)
    expect($selectionDraftRequest.get()).toBeNull()
  })

  it('formats the transcript quote with role, title fallback and a link back', () => {
    let text = ''

    $selectionDraftRequest.listen(request => {
      text = request?.text ?? text
    })
    mountTranscript()
    selectAll('a')

    expect(openTranscriptSelectionInNewDraft()).toBe(true)
    expect(text).toBe(
      '> Alpha **beta** gamma.\n\n' +
        'Source: assistant message in the Hermes conversation “Untitled conversation” — hermes://open/sess-42\n\n'
    )
  })

  it('uses the dev scheme the preload reports for the link', () => {
    let text = ''

    desktopWindow.hermesDesktop = { deepLinkProtocol: 'hermes-dev' } as unknown as Window['hermesDesktop']
    $selectionDraftRequest.listen(request => {
      text = request?.text ?? text
    })
    mountTranscript()
    selectAll('u')

    expect(openTranscriptSelectionInNewDraft()).toBe(true)
    expect(text).toContain('Source: your message in the Hermes conversation')
    expect(text).toContain('— hermes-dev://open/sess-42')
  })

  it('says why when nothing is selected, and files no request', () => {
    mountTranscript()

    expect(openTranscriptSelectionInNewDraft()).toBe(false)
    expect($selectionDraftRequest.get()).toBeNull()
    expect($notifications.get()[0]).toMatchObject({
      kind: 'warning',
      message: 'Select text in a user or assistant message first.'
    })
  })

  it('opens a macOS hand-off and names refusals from main', () => {
    let text = ''

    $selectionDraftRequest.listen(request => {
      text = request?.text ?? text
    })

    expect(
      openNativeSelectionDraft({
        ok: true,
        text: 'from Safari',
        source: { appName: 'Safari', bundleId: 'com.apple.Safari', url: 'https://example.com', document: '' }
      })
    ).toBe(true)
    expect(text).toBe('> from Safari\n\nSource: Safari (com.apple.Safari) — https://example.com\n\n')

    expect(openNativeSelectionDraft({ ok: false, error: 'empty' })).toBe(false)
    expect($notifications.get()[0]?.message).toMatch(/handed over no text/)
    expect(openNativeSelectionDraft({ ok: false, error: 'missing' })).toBe(false)
    expect($notifications.get()[0]?.message).toMatch(/expired or was not valid/)
    expect(openNativeSelectionDraft({ ok: false, error: 'tooLarge', length: 200_000 })).toBe(false)
    expect($notifications.get()[0]?.message).toMatch(/200000|200,000/)
  })

  it('subscribes to the hand-off main relays and unsubscribes on unmount', () => {
    const off = vi.fn()
    let deliver: ((payload: unknown) => void) | null = null

    desktopWindow.hermesDesktop = {
      selectionService: {
        onDraft: (callback: (payload: unknown) => void) => {
          deliver = callback

          return off
        }
      }
    } as unknown as Window['hermesDesktop']

    const start = vi.fn()
    const { unmount } = renderHook(() => useSelectionDraftRequests(start))

    act(() => deliver!({ ok: true, text: 'relayed', source: { appName: 'Notes' } }))
    expect(start).toHaveBeenCalledWith({ rotateFreshDraftKey: false })

    unmount()
    expect(off).toHaveBeenCalled()
  })
})
