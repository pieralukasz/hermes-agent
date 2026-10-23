import { afterEach, describe, expect, it } from 'vitest'

import { enSelectionDraft } from '@/i18n/en_selection_draft'

import {
  formatSelectionDraft,
  hermesSessionLink,
  MAX_SELECTION_DRAFT_CHARS,
  normalizeSelectionText,
  type SelectionDraftCopy
} from './selection-draft'
import { quoteLines, rangeToMarkdown } from './selection-markdown'

const copy: SelectionDraftCopy = {
  roleLabel: role => (role === 'user' ? enSelectionDraft.roleUser : enSelectionDraft.roleAssistant),
  hermesSource: enSelectionDraft.hermesSource,
  nativeSource: enSelectionDraft.nativeSource,
  untitledConversation: enSelectionDraft.untitledConversation
}

function selectContents(root: Element, start: Node = root, end: Node = root): Range {
  const range = document.createRange()

  range.setStartBefore(start === root ? root.firstChild! : start)
  range.setEndAfter(end === root ? root.lastChild! : end)

  return range
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('normalizeSelectionText', () => {
  it('drops blank edge lines but keeps inner indentation and blank lines', () => {
    expect(normalizeSelectionText('\r\n\n  first\r\n\n    indented  \n\n')).toBe('  first\n\n    indented  ')
  })

  it('returns empty for whitespace-only input', () => {
    expect(normalizeSelectionText(' \n\t\n ')).toBe('')
  })
})

describe('formatSelectionDraft', () => {
  it('quotes a Hermes selection exactly and links back to its conversation, nothing else', () => {
    const result = formatSelectionDraft(
      'Use **bold** and `code`.\n\n- one\n- two',
      {
        kind: 'hermes',
        role: 'assistant',
        sessionId: 'abc 123',
        title: 'Release plan',
        link: hermesSessionLink('hermes', 'abc 123')
      },
      copy
    )

    expect(result).toEqual({
      ok: true,
      draft:
        '> Use **bold** and `code`.\n>\n> - one\n> - two\n\n' +
        'Source: assistant message in the Hermes conversation “Release plan” — hermes://open/abc%20123\n\n'
    })
  })

  it('names an untitled user message and omits the link when the chat has no stored id yet', () => {
    const result = formatSelectionDraft(
      'hi',
      { kind: 'hermes', role: 'user', sessionId: null, title: ' ', link: null },
      copy
    )

    expect(result).toEqual({
      ok: true,
      draft: '> hi\n\nSource: your message in the Hermes conversation “Untitled conversation”\n\n'
    })
  })

  it('cites the macOS source app and the URL when one was handed over', () => {
    const result = formatSelectionDraft(
      'quoted line',
      { kind: 'native', appName: 'Safari', bundleId: 'com.apple.Safari', url: 'https://example.com/a', document: '' },
      copy
    )

    expect(result).toEqual({
      ok: true,
      draft: '> quoted line\n\nSource: Safari (com.apple.Safari) — https://example.com/a\n\n'
    })
  })

  it('falls back to the document path, then to the bare app', () => {
    const doc = formatSelectionDraft(
      'x',
      { kind: 'native', appName: 'TextEdit', bundleId: '', url: '', document: '/Users/me/notes.txt' },
      copy
    )

    const bare = formatSelectionDraft('x', { kind: 'native', appName: '', bundleId: '', url: '', document: '' }, copy)

    expect(doc.ok && doc.draft).toContain('Source: TextEdit — /Users/me/notes.txt')
    expect(bare.ok && bare.draft).toContain('Source: another app\n')
  })

  it('refuses empty and oversized selections instead of opening a chat', () => {
    const source = { kind: 'native', appName: 'A', bundleId: '', url: '', document: '' } as const

    expect(formatSelectionDraft(' \n ', source, copy)).toEqual({ ok: false, reason: 'empty' })
    expect(formatSelectionDraft('x'.repeat(MAX_SELECTION_DRAFT_CHARS + 1), source, copy)).toEqual({
      ok: false,
      reason: 'tooLarge',
      length: MAX_SELECTION_DRAFT_CHARS + 1
    })
  })
})

describe('rangeToMarkdown', () => {
  it('keeps emphasis, links, inline code and lists the reader saw', () => {
    const root = document.createElement('div')

    root.innerHTML =
      '<p>Run <code>bun test</code> with <strong>care</strong> and <em>style</em>, see <a href="https://x.dev">docs</a>.</p>' +
      '<ul><li>alpha</li><li>beta</li></ul><ol start="3"><li>three</li></ol>'
    document.body.appendChild(root)

    expect(rangeToMarkdown(selectContents(root), root)).toBe(
      'Run `bun test` with **care** and *style*, see [docs](https://x.dev).\n\n- alpha\n- beta\n\n3. three'
    )
  })

  it('fences a code block with its language and verbatim whitespace', () => {
    const root = document.createElement('div')

    root.innerHTML = '<pre><code class="language-ts">const a = 1\n  if (a) {\n    go()\n  }\n</code></pre>'
    document.body.appendChild(root)

    expect(rangeToMarkdown(selectContents(root), root)).toBe('```ts\nconst a = 1\n  if (a) {\n    go()\n  }\n```')
  })

  it('keeps a code fence when the selection is only part of a code block', () => {
    const root = document.createElement('div')

    root.innerHTML = '<pre><code class="language-py">print(1)\nprint(2)</code></pre>'
    document.body.appendChild(root)
    const text = root.querySelector('code')!.firstChild!
    const range = document.createRange()

    range.setStart(text, 0)
    range.setEnd(text, 8)

    expect(rangeToMarkdown(range, root)).toBe('```py\nprint(1)\n```')
  })

  it('writes a KaTeX formula once, as its TeX source, and skips buttons', () => {
    const root = document.createElement('div')

    root.innerHTML =
      '<p>Area <span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow>' +
      '<annotation encoding="application/x-tex">\\pi r^2</annotation></semantics></math></span>' +
      '<span aria-hidden="true">πr2</span></span> <button>Copy</button></p>'
    document.body.appendChild(root)

    expect(rangeToMarkdown(selectContents(root), root)).toBe('Area $\\pi r^2$')
  })

  it('serializes a table as a Markdown table', () => {
    const root = document.createElement('div')

    root.innerHTML = '<table><tr><th>k</th><th>v</th></tr><tr><td>a|b</td><td>1</td></tr></table>'
    document.body.appendChild(root)

    expect(rangeToMarkdown(selectContents(root), root)).toBe('| k | v |\n| --- | --- |\n| a\\|b | 1 |')
  })
})

describe('quoteLines', () => {
  it('quotes every line and keeps blank lines inside the quote', () => {
    expect(quoteLines('a\n\nb')).toBe('> a\n>\n> b')
  })
})
