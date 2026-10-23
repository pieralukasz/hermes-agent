import { afterEach, describe, expect, it } from 'vitest'

import { $selectedStoredSessionId } from '@/store/session'

import {
  resolveTranscriptSelection,
  restoreSnapshotForClick,
  snapshotTranscriptSelection,
  surfaceSessionId
} from './transcript-selection'

function mountTranscript(): HTMLElement {
  const host = document.createElement('div')

  host.innerHTML = `
    <section data-chat-surface="" data-session-anchor="session-tile:sess-1">
      <div data-role="user" id="user"><p id="user-p">What does <strong>X</strong> do?</p></div>
      <div data-role="assistant" id="assistant">
        <p id="a1">X <em>quotes</em> text.</p>
        <p id="a2">Second paragraph.</p>
        <div id="actions"><button>Copy</button></div>
      </div>
      <textarea id="composer">draft</textarea>
    </section>
    <nav id="sidebar"><p id="side">Sidebar row</p></nav>`
  document.body.appendChild(host)

  return host
}

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
  const selection = window.getSelection()!
  const range = document.createRange()

  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  selection.removeAllRanges()
  selection.addRange(range)

  return selection
}

const byId = (id: string) => document.getElementById(id)!

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('resolveTranscriptSelection', () => {
  it('accepts text inside one assistant message, as Markdown with role and session id', () => {
    mountTranscript()
    const a1 = byId('a1')
    const selection = select(a1, 0, byId('a2'), 1)
    const result = resolveTranscriptSelection(selection)

    expect(result.kind).toBe('message')
    expect(result.kind === 'message' && result.role).toBe('assistant')
    expect(result.kind === 'message' && result.sessionId).toBe('sess-1')
    expect(result.kind === 'message' && result.markdown).toBe('X *quotes* text.\n\nSecond paragraph.')
  })

  it('accepts a user message selection', () => {
    mountTranscript()
    const p = byId('user-p')
    const result = resolveTranscriptSelection(select(p, 0, p, p.childNodes.length))

    expect(result.kind === 'message' && result.role).toBe('user')
    expect(result.kind === 'message' && result.markdown).toBe('What does **X** do?')
  })

  it('refuses a selection that spans two messages instead of widening to the conversation', () => {
    mountTranscript()

    expect(resolveTranscriptSelection(select(byId('user-p'), 0, byId('a1'), 1)).kind).toBe('multiple')
  })

  it('refuses text outside any message (sidebar) and a collapsed caret', () => {
    mountTranscript()
    const side = byId('side')

    expect(resolveTranscriptSelection(select(side, 0, side, 1)).kind).toBe('outside')
    expect(resolveTranscriptSelection(select(side, 0, side, 0)).kind).toBe('none')
  })

  it('refuses a selection reaching from a message into the composer', () => {
    mountTranscript()

    expect(resolveTranscriptSelection(select(byId('a2'), 0, byId('composer'), 0)).kind).not.toBe('message')
  })
})

describe('surfaceSessionId', () => {
  it('reads a tile from its anchor and the primary surface from the selected session', () => {
    const tile = document.createElement('section')
    const primary = document.createElement('section')

    tile.setAttribute('data-session-anchor', 'session-tile:tile-7')
    primary.setAttribute('data-session-anchor', 'workspace')
    $selectedStoredSessionId.set('primary-3')

    expect(surfaceSessionId(tile)).toBe('tile-7')
    expect(surfaceSessionId(primary)).toBe('primary-3')
    expect(surfaceSessionId(null)).toBeNull()
    $selectedStoredSessionId.set(null)
  })
})

describe('selection snapshot across a right-button press', () => {
  it('restores the highlight a press inside the same message collapsed', () => {
    mountTranscript()
    const a1 = byId('a1')
    const selection = select(a1, 0, a1, a1.childNodes.length)
    const snapshot = snapshotTranscriptSelection(selection, 1000)

    // What Chromium does on a right-press beside the highlight.
    selection.collapse(byId('actions'), 0)
    expect(resolveTranscriptSelection(selection).kind).toBe('none')

    expect(restoreSnapshotForClick(snapshot, byId('actions'), selection, 1500)).toBe(true)
    expect(selection.toString()).toBe('X quotes text.')
  })

  it('does not restore for a click in another message, or after the gesture expired', () => {
    mountTranscript()
    const a1 = byId('a1')
    const selection = select(a1, 0, a1, a1.childNodes.length)
    const snapshot = snapshotTranscriptSelection(selection, 1000)

    selection.collapse(byId('user-p'), 0)
    expect(restoreSnapshotForClick(snapshot, byId('user-p'), selection, 1100)).toBe(false)
    expect(restoreSnapshotForClick(snapshot, byId('actions'), selection, 10_000)).toBe(false)
  })
})
