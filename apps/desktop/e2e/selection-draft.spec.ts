/**
 * "New chat from selected text" end to end: the transcript context menu, the
 * ⌘⇧E keybind, and the macOS Services hand-off (main reads the inbox file the
 * Service writes, the renderer opens it). Every path must open a NEW chat
 * whose composer holds the quote + source and must never send it.
 *
 * SELECTION_DRAFT_SHOTS=<dir> also writes the screenshots used as PR evidence.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'

import { MOCK_REPLY } from '../../../tests-js/scripts/mock-server'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

const PROMPT = 'Please answer with the canned reply'
const SHOTS = process.env.SELECTION_DRAFT_SHOTS || ''
let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()
  await waitForAppReady(fixture!, 120_000)
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

async function shot(page: Page, name: string) {
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  }
}

const composerText = (page: Page) =>
  page.locator('[data-slot="composer-root"] [contenteditable="true"]').first().innerText()

const menuText = async (page: Page) => (await page.locator('[role="menu"]').allInnerTexts()).join('\n')

async function dragSelect(page: Page, x1: number, x2: number, y: number) {
  await page.mouse.move(x1, y)
  await page.mouse.down()
  await page.mouse.move(x2, y, { steps: 8 })
  await page.mouse.up()
}

/** Boot toasts (low disk, usage stats) sit over the transcript top. */
async function dismissToasts(page: Page) {
  for (const close of await page.locator('[aria-label="Notifications"] [data-slot="alert"] button[aria-label]').all()) {
    await close.click({ timeout: 2000 }).catch(() => undefined)
  }
}

async function backToSource(page: Page, sourceHash: string) {
  await page.keyboard.press('Escape')
  await page.evaluate(hash => (window.location.hash = hash), sourceHash)
  await page
    .locator('[data-role="assistant"]')
    .filter({ hasText: MOCK_REPLY.slice(0, 20) })
    .last()
    .waitFor()
  await dismissToasts(page)
}

test('selected transcript text opens an unsent new chat; the macOS hand-off does too', async () => {
  const { app, mock, page, sandbox } = fixture!
  const composer = page.locator('[data-slot="composer-root"] [contenteditable="true"]').first()

  await composer.click()
  await composer.type(PROMPT)
  await page.keyboard.press('Enter')

  const reply = page
    .locator('[data-role="assistant"]')
    .filter({ hasText: MOCK_REPLY.slice(0, 20) })
    .last()

  await reply.waitFor({ state: 'visible', timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 30_000 }).not.toMatch(/#\/new/)
  await page.waitForTimeout(1000)
  await dismissToasts(page)

  const sourceHash = await page.evaluate(() => window.location.hash)
  const sessionId = decodeURIComponent(sourceHash.replace(/^#\//, '').split(/[?#]/)[0]!)
  const promptsBefore = mock.receivedPrompts.length
  const paragraph = reply.locator('p').first()
  const box = (await paragraph.boundingBox())!
  const rowBox = (await reply.boundingBox())!
  const mid = box.y + box.height / 2

  // 1. Right-click ON the selection: the app menu offers Copy + the new item.
  await dragSelect(page, box.x + 4, box.x + 120, mid)
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')

  expect(selected.length).toBeGreaterThan(3)
  await page.mouse.click(box.x + 40, mid, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: /New chat with selection/ })).toBeVisible()
  await shot(page, 'after-assistant-menu')

  await page.getByRole('menuitem', { name: /New chat with selection/ }).click()
  await expect.poll(() => composerText(page)).toContain(`> ${selected.trim()}`)

  const draft = await composerText(page)

  expect(draft).toContain('Source: assistant message in the Hermes conversation')
  expect(draft).toContain(`hermes://open/${encodeURIComponent(sessionId)}`)
  // Only the selection travels, never the rest of the conversation.
  // (The user prompt appears once: it is the conversation's title on the source line.)
  expect(draft).not.toContain(MOCK_REPLY)
  expect(draft.split(PROMPT).length - 1).toBe(1)
  expect(draft).toContain(`conversation “${PROMPT}”`)
  expect(await page.evaluate(() => window.location.hash)).not.toBe(sourceHash)
  await expect(page.locator('[data-role="user"]')).toHaveCount(0)

  // The person appends a question; still nothing is sent.
  await composer.click()
  await page.keyboard.press('End')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.type('What does this mean?')
  await expect.poll(() => composerText(page)).toContain('What does this mean?')
  await shot(page, 'after-new-draft')
  await page.waitForTimeout(500)
  expect(mock.receivedPrompts.length).toBe(promptsBefore)

  // 2. Right-click BESIDE the highlight (line end inside the message row):
  // Chromium collapses the selection on the press; the menu must still answer
  // for it instead of falling back to the tab/zone menu.
  await backToSource(page, sourceHash)
  await dragSelect(page, box.x + 4, box.x + 120, mid)
  await page.mouse.click(rowBox.x + rowBox.width - 10, mid, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: /New chat with selection/ })).toBeVisible()
  expect(await menuText(page)).not.toMatch(/Close all/)
  await shot(page, 'after-right-of-line')
  await page.keyboard.press('Escape')

  // 3. A selection spanning two messages is refused, never widened. (A mouse
  // drag that starts on the user bubble does not select, so set the range directly.)
  const user = page.locator('[data-role="user"]').last()
  const userBox = (await user.boundingBox())!

  await page.evaluate(() => {
    const users = document.querySelectorAll('[data-role="user"]')
    const assistants = document.querySelectorAll('[data-role="assistant"]')
    const range = document.createRange()

    range.setStart(users[users.length - 1]!, 0)
    range.setEnd(assistants[assistants.length - 1]!.querySelector('p')!, 1)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  })
  await page.mouse.click(box.x + 40, mid, { button: 'right' })
  await page.waitForTimeout(400)
  expect(await menuText(page)).not.toMatch(/New chat with selection/)
  await shot(page, 'after-cross-message')
  await page.keyboard.press('Escape')

  // 4. Keyboard: ⌘⇧E (Ctrl+Shift+E elsewhere) on a user-message selection.
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  const userText = user.locator('p, [data-slot="user-message-text"]').first()
  const ub = (await userText.boundingBox().catch(() => null)) ?? userBox

  await dragSelect(page, ub.x + 4, ub.x + Math.min(150, ub.width - 4), ub.y + ub.height / 2)
  const userSelected = (await page.evaluate(() => window.getSelection()?.toString() ?? '')).trim()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+E' : 'Control+Shift+E')
  await expect.poll(() => composerText(page)).toContain(`> ${userSelected}`)
  expect(await composerText(page)).toContain('Source: your message in the Hermes conversation')

  // 5. ⌘⇧E with nothing selected says why instead of opening an empty chat.
  await backToSource(page, sourceHash)
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  const hashBefore = await page.evaluate(() => window.location.hash)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+E' : 'Control+Shift+E')
  await expect(page.getByText('Select text in a user or assistant message first.')).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)

  // 6. macOS Services hand-off: the Service writes <userData>/selection-inbox/<id>.json
  // and opens hermes://selection/new?id=<id>. Main consumes and validates it.
  const inbox = path.join(sandbox.userDataDir, 'selection-inbox')
  const id = randomUUID().toUpperCase()

  fs.mkdirSync(inbox, { recursive: true })
  fs.writeFileSync(
    path.join(inbox, `${id}.json`),
    JSON.stringify({
      version: 1,
      text: 'Native line one\n    indented line two\n',
      createdAt: Date.now(),
      source: { appName: 'TextEdit', bundleId: 'com.apple.TextEdit', url: '', document: '/Users/me/notes.txt' }
    })
  )

  const openUrl = (url: string) =>
    app.evaluate(({ app: electronApp }, link) => {
      electronApp.emit('open-url', { preventDefault() {} }, link)
    }, url)

  await openUrl(`hermes://selection/new?id=${id}`)
  await expect.poll(() => composerText(page)).toContain('> Native line one')

  const nativeDraft = await composerText(page)

  expect(nativeDraft).toContain('>     indented line two')
  expect(nativeDraft).toContain('Source: TextEdit (com.apple.TextEdit) — /Users/me/notes.txt')
  expect(fs.existsSync(path.join(inbox, `${id}.json`))).toBe(false)
  await shot(page, 'after-native-draft')

  // A replayed or forged link (file already consumed) is refused out loud.
  await openUrl(`hermes://selection/new?id=${id}`)
  await expect(page.getByText(/expired or was not valid/)).toBeVisible()
  await shot(page, 'after-native-refused')

  await page.waitForTimeout(500)
  expect(mock.receivedPrompts.length).toBe(promptsBefore)
})
