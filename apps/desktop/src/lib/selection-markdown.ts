/**
 * Rendered transcript selection → Markdown.
 *
 * `Selection.toString()` flattens what the user highlighted: code fences,
 * list markers, emphasis and links vanish, and KaTeX prints every formula
 * twice. Quoting that into a new chat loses the formatting the reader saw, so
 * the selected DOM fragment is serialized back to Markdown here instead. Only
 * the selected nodes are read, never the message's stored source: a partial
 * selection has no reliable mapping back into the raw Markdown.
 */

const SKIPPED_TAGS = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT'])

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'DETAILS',
  'DIV',
  'DL',
  'FIGURE',
  'FOOTER',
  'HEADER',
  'MAIN',
  'NAV',
  'P',
  'SECTION',
  'SUMMARY'
])

const HEADING_RE = /^H([1-6])$/

function languageOf(element: Element | null): string {
  const code = element?.matches('code') ? element : element?.querySelector('code')
  const match = `${code?.className ?? ''} ${element?.className ?? ''}`.match(/(?:^|\s)language-([\w+#.-]+)/)

  return match?.[1] ?? ''
}

function fence(code: string, language: string): string {
  const body = code.replace(/\n+$/, '')
  // A fence must be longer than any backtick run inside the code.
  const longest = Math.max(2, ...Array.from(body.matchAll(/`+/g), run => run[0].length))
  const ticks = '`'.repeat(longest + 1)

  return `${ticks}${language}\n${body}\n${ticks}`
}

function inlineCode(text: string): string {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), run => run[0].length))
  const ticks = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''

  return `${ticks}${pad}${text}${pad}${ticks}`
}

function texOf(element: Element): string | null {
  const annotation = element.querySelector('annotation[encoding="application/x-tex"]')

  return annotation?.textContent?.trim() || null
}

function joinBlocks(blocks: string[]): string {
  return blocks
    .map(block => block.replace(/^\n+|\n+$/g, ''))
    .filter(block => block.trim().length > 0)
    .join('\n\n')
}

interface Context {
  /** Inside `<pre>`: keep whitespace verbatim. */
  pre: boolean
}

function serializeChildren(node: Node, context: Context): string {
  const parts: string[] = []
  const blocks: string[] = []
  let sawBlock = false

  const flushInline = () => {
    const inline = parts.join('')
    parts.length = 0

    if (inline.trim()) {
      blocks.push(context.pre ? inline : inline.replace(/[ \t]+\n/g, '\n').trim())
    }
  }

  for (const child of Array.from(node.childNodes)) {
    const isBlock = child instanceof Element && isBlockElement(child)

    if (isBlock) {
      flushInline()
      sawBlock = true
      blocks.push(serializeNode(child, context))
    } else {
      parts.push(serializeNode(child, context))
    }
  }

  if (!sawBlock) {
    return parts.join('')
  }

  flushInline()

  return joinBlocks(blocks)
}

function isBlockElement(element: Element): boolean {
  const tag = element.tagName.toUpperCase()

  return (
    BLOCK_TAGS.has(tag) ||
    HEADING_RE.test(tag) ||
    tag === 'PRE' ||
    tag === 'UL' ||
    tag === 'OL' ||
    tag === 'LI' ||
    tag === 'BLOCKQUOTE' ||
    tag === 'TABLE' ||
    tag === 'HR'
  )
}

function serializeList(list: Element, context: Context): string {
  const ordered = list.tagName.toUpperCase() === 'OL'
  const start = Number(list.getAttribute('start') ?? '1') || 1
  const items = Array.from(list.children).filter(child => child.tagName.toUpperCase() === 'LI')

  return items
    .map((item, index) => {
      const marker = ordered ? `${start + index}. ` : '- '
      const checkbox = item.querySelector(':scope > input[type="checkbox"]')
      const task = checkbox instanceof HTMLInputElement ? (checkbox.checked ? '[x] ' : '[ ] ') : ''
      const body = serializeChildren(item, context).trim()
      const indent = ' '.repeat(marker.length)

      return `${marker}${task}${body.split('\n').join(`\n${indent}`)}`
    })
    .join('\n')
}

function serializeTable(table: Element, context: Context): string {
  const rows = Array.from(table.querySelectorAll('tr')).map(row =>
    Array.from(row.children).map(cell =>
      serializeChildren(cell, context).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
    )
  )

  if (rows.length === 0) {
    return ''
  }

  const width = Math.max(...rows.map(row => row.length))
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
  const [head, ...body] = rows

  return [line(head!), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join('\n')
}

/** Wrap non-blank inline content in a Markdown marker (`**`, `*`, `~~`). */
function wrapInline(marker: string) {
  return (element: Element, context: Context): string => {
    const inner = serializeChildren(element, context)

    return inner.trim() ? `${marker}${inner}${marker}` : inner
  }
}

function serializeLink(element: Element, context: Context): string {
  const text = serializeChildren(element, context)
  const href = element.getAttribute('href')?.trim() ?? ''

  return href && href !== '#' && text.trim() && text.trim() !== href ? `[${text.trim()}](${href})` : text
}

type ElementSerializer = (element: Element, context: Context) => string

/** Per-tag Markdown; tags not listed serialize as their children. */
const TAG_SERIALIZERS: Record<string, ElementSerializer> = {
  A: serializeLink,
  B: wrapInline('**'),
  BLOCKQUOTE: (element, context) => quoteLines(serializeChildren(element, context).trim()),
  BR: () => '\n',
  CODE: (element, context) => (context.pre ? (element.textContent ?? '') : inlineCode(element.textContent ?? '')),
  DEL: wrapInline('~~'),
  EM: wrapInline('*'),
  HR: () => '---',
  I: wrapInline('*'),
  IMG: element => {
    const alt = element.getAttribute('alt')?.trim()

    return alt ? `[image: ${alt}]` : ''
  },
  OL: serializeList,
  PRE: element => fence(element.textContent ?? '', languageOf(element)),
  S: wrapInline('~~'),
  STRONG: wrapInline('**'),
  TABLE: serializeTable,
  UL: serializeList
}

/** KaTeX keeps its TeX source in a MathML annotation; print the formula once, as TeX. */
function serializeKatex(element: Element): null | string {
  if (!element.classList.contains('katex') && !element.classList.contains('katex-display')) {
    return null
  }

  const tex = texOf(element)

  if (!tex) {
    return null
  }

  return element.classList.contains('katex-display') ? `$$\n${tex}\n$$` : `$${tex}$`
}

function serializeElement(element: Element, context: Context): string {
  const tag = element.tagName.toUpperCase()

  if (SKIPPED_TAGS.has(tag) || element.getAttribute('aria-hidden') === 'true') {
    return ''
  }

  const katex = serializeKatex(element)

  if (katex !== null) {
    return katex
  }

  const heading = tag.match(HEADING_RE)

  if (heading) {
    return `${'#'.repeat(Number(heading[1]))} ${serializeChildren(element, context).trim()}`
  }

  return (TAG_SERIALIZERS[tag] ?? serializeChildren)(element, context)
}

function serializeNode(node: Node, context: Context): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''

    return context.pre ? text : text.replace(/\s+/g, ' ')
  }

  if (node instanceof Element) {
    return serializeElement(node, context)
  }

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return serializeChildren(node, context)
  }

  return ''
}

/** Prefix every line with `> ` (blank lines become a bare `>`). */
export function quoteLines(markdown: string): string {
  return markdown
    .split('\n')
    .map(line => (line.trim() ? `> ${line}` : '>'))
    .join('\n')
}

/** The nearest ancestor (inclusive) of `node` matching `selector`, bounded by `root`. */
function closestWithin(node: Node | null, selector: string, root: Element | null): Element | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  const match = element?.closest(selector) ?? null

  return match && (!root || root.contains(match)) ? match : null
}

/**
 * Markdown for one selected range. `root` bounds the ancestor context lookup
 * (the message the selection lives in): a range entirely inside a code block
 * or an inline code span keeps that wrapper even though the fragment itself
 * holds only bare text.
 */
export function rangeToMarkdown(range: Range, root: Element | null = null): string {
  const fragment = range.cloneContents()
  const ancestor = range.commonAncestorContainer
  const pre = closestWithin(ancestor, 'pre', root)

  if (pre) {
    return fence(fragment.textContent ?? '', languageOf(pre))
  }

  const markdown = serializeChildren(fragment, { pre: false })
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (closestWithin(ancestor, 'code', root) && !markdown.includes('\n')) {
    return inlineCode(fragment.textContent ?? markdown)
  }

  return markdown
}
