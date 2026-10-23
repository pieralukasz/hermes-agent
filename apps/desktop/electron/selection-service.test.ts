import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSelectionServiceBundle,
  createSelectionDraftRelay,
  type Exec,
  HANDOFF_MAX_AGE_MS,
  installSelectionService,
  installSelectionServiceBridge,
  MAX_HANDOFF_TEXT_CHARS,
  readSelectionHandoff,
  readSelectionServiceStatus,
  SELECTION_SERVICE_KEY_EQUIVALENT,
  selectionServiceIdentity,
  selectionServiceScript,
  servicesStatusKey,
  uninstallSelectionService
} from './selection-service'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-selection-'))
})

afterEach(() => {
  fs.rmSync(root, { force: true, recursive: true })
})

function identity(protocol = 'hermes') {
  return selectionServiceIdentity({
    appId: 'com.nousresearch.hermes',
    displayName: 'Hermes',
    homeDir: path.join(root, 'home'),
    protocol,
    userDataDir: path.join(root, 'userData')
  })
}

function writeHandoff(inbox: string, body: unknown, id = ID) {
  fs.mkdirSync(inbox, { recursive: true })
  fs.writeFileSync(path.join(inbox, `${id}.json`), typeof body === 'string' ? body : JSON.stringify(body))
}

describe('selectionServiceIdentity', () => {
  it('keeps the installed app and a dev build apart', () => {
    const stable = identity('hermes')
    const dev = identity('hermes-dev')

    expect(stable.serviceName).toBe('New Hermes Chat from Selection')
    expect(dev.serviceName).toBe('New Hermes Chat from Selection (hermes-dev)')
    expect(stable.workflowPath).toBe(path.join(root, 'home/Library/Services/New Hermes Chat from Selection.workflow'))
    expect(dev.workflowPath).not.toBe(stable.workflowPath)
    expect(dev.bundleId).not.toBe(stable.bundleId)
    expect(stable.inboxDir).toBe(path.join(root, 'userData/selection-inbox'))
  })

  it('rejects a scheme that could break out of the generated shell script', () => {
    expect(() => identity("hermes'; rm -rf ~")).toThrow(/invalid deep-link scheme/)
  })
})

describe('workflow bundle', () => {
  it('declares a text-only Services entry and reads the selection from stdin, never the clipboard', () => {
    const files = buildSelectionServiceBundle(identity(), { includeContext: false })
    const info = files['Contents/Info.plist']!
    const wflow = files['Contents/document.wflow']!

    expect(info).toContain('<string>public.utf8-plain-text</string>')
    expect(info).toContain('<string>New Hermes Chat from Selection</string>')
    expect(wflow).toContain('<string>com.apple.Automator.servicesMenu</string>')
    expect(wflow).toMatch(/<key>inputMethod<\/key>\s*<integer>0<\/integer>/)
    expect(wflow).not.toMatch(/pbpaste|pbcopy|NSPasteboard|generalPasteboard|System Events/i)
  })

  it('only asks the front app for its URL/document when the person opted in', () => {
    const off = selectionServiceScript(identity(), false)
    const on = selectionServiceScript(identity(), true)

    expect(off).toMatch(/'hermes' 0 <<'HERMES_JXA'/)
    expect(on).toMatch(/'hermes' 1 <<'HERMES_JXA'/)
    expect(off).toContain('umask 077')
  })

  it.runIf(process.platform === 'darwin')('writes plists macOS itself accepts', async () => {
    const id = identity()

    await installSelectionService(id, {
      exec: async () => ({ code: 0, stdout: '', stderr: '' }),
      includeContext: false
    })

    for (const file of ['Info.plist', 'document.wflow']) {
      const lint = execFileSync('/usr/bin/plutil', ['-lint', path.join(id.workflowPath, 'Contents', file)], {
        encoding: 'utf8'
      })

      expect(lint).toMatch(/: OK$/m)
    }
  })

  it('XML-escapes values written into the plist', () => {
    const files = buildSelectionServiceBundle(
      selectionServiceIdentity({
        appId: 'a',
        displayName: 'A&B <x>',
        homeDir: root,
        protocol: 'hermes',
        userDataDir: root
      }),
      { includeContext: false }
    )

    expect(files['Contents/Info.plist']).toContain('New A&amp;B &lt;x&gt; Chat from Selection')
  })
})

describe('install / status / remove', () => {
  function fakeExec(existing = '') {
    const calls: string[][] = []

    const exec: Exec = async (command, args) => {
      calls.push([command, ...args])

      return command === '/usr/bin/defaults' && args[0] === 'export'
        ? { code: 0, stdout: existing, stderr: '' }
        : { code: 0, stdout: '', stderr: '' }
    }

    return { calls, exec }
  }

  it('installs the bundle, sets the default ⌃⌥⌘H shortcut once, and rescans Services', async () => {
    const id = identity()
    const { calls, exec } = fakeExec()

    await installSelectionService(id, { exec, includeContext: true })

    expect(fs.existsSync(path.join(id.workflowPath, 'Contents/Info.plist'))).toBe(true)
    expect(fs.statSync(id.inboxDir).mode & 0o777).toBe(0o700)
    expect(calls).toContainEqual([
      '/usr/bin/defaults',
      'write',
      'pbs',
      'NSServicesStatus',
      '-dict-add',
      servicesStatusKey(id),
      expect.stringContaining(`"key_equivalent" = "${SELECTION_SERVICE_KEY_EQUIVALENT}"`)
    ])
    expect(calls.at(-1)).toEqual(['/System/Library/CoreServices/pbs', '-update'])
    expect(readSelectionServiceStatus(id, 'darwin')).toMatchObject({
      supported: true,
      installed: true,
      stale: false,
      includeContext: true
    })
  })

  it("keeps the person's own shortcut on reinstall", async () => {
    const id = identity()
    const { calls, exec } = fakeExec(`<key>${servicesStatusKey(id)}</key>`)

    await installSelectionService(id, { exec, includeContext: false })

    expect(calls.some(call => call[1] === 'write')).toBe(false)
  })

  it('removes the bundle', async () => {
    const id = identity()
    const { exec } = fakeExec()

    await installSelectionService(id, { exec, includeContext: false })
    await uninstallSelectionService(id, { exec })

    expect(fs.existsSync(id.workflowPath)).toBe(false)
    expect(readSelectionServiceStatus(id, 'darwin').installed).toBe(false)
  })

  it('reports unsupported off macOS and refuses to install there', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()

    installSelectionServiceBridge({
      appId: 'a',
      displayName: 'Hermes',
      getPath: name => path.join(root, name),
      ipc: { handle: (channel, listener) => handlers.set(channel, listener), on: vi.fn() },
      isReady: () => true,
      log: vi.fn(),
      platform: 'linux',
      protocol: 'hermes',
      send: vi.fn()
    })

    expect(await handlers.get('hermes:selection-service:status')!({})).toMatchObject({ supported: false })
    await expect(
      Promise.resolve().then(() => handlers.get('hermes:selection-service:install')!({}, { includeContext: false }))
    ).rejects.toThrow(/only available on macOS/)
  })
})

describe('readSelectionHandoff', () => {
  const now = 1_800_000_000_000
  const inbox = () => path.join(root, 'inbox')

  it('accepts a fresh hand-off once, then deletes it', () => {
    writeHandoff(inbox(), {
      version: 1,
      text: 'selected words',
      createdAt: now,
      source: { appName: 'Safari', bundleId: 'com.apple.Safari', url: 'https://e.x', document: '' }
    })

    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({
      ok: true,
      text: 'selected words',
      source: { appName: 'Safari', bundleId: 'com.apple.Safari', url: 'https://e.x', document: '' }
    })
    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({ ok: false, error: 'missing' })
  })

  it('never treats the id as a path', () => {
    writeHandoff(root, { version: 1, text: 'x', createdAt: now })

    expect(readSelectionHandoff(inbox(), '../x', now)).toEqual({ ok: false, error: 'invalid' })
    expect(readSelectionHandoff(inbox(), `../${ID}`, now)).toEqual({ ok: false, error: 'invalid' })
  })

  it('names empty, expired, malformed and oversized hand-offs', () => {
    writeHandoff(inbox(), { version: 1, text: '  \n', createdAt: now })
    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({ ok: false, error: 'empty' })

    writeHandoff(inbox(), { version: 1, text: 'x', createdAt: now - HANDOFF_MAX_AGE_MS - 1 })
    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({ ok: false, error: 'expired' })

    writeHandoff(inbox(), '{nope')
    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({ ok: false, error: 'invalid' })

    writeHandoff(inbox(), { version: 1, text: 'y'.repeat(MAX_HANDOFF_TEXT_CHARS + 1), createdAt: now })
    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({
      ok: false,
      error: 'tooLarge',
      length: MAX_HANDOFF_TEXT_CHARS + 1
    })
  })

  it('refuses a symlink planted in the inbox', () => {
    fs.mkdirSync(inbox(), { recursive: true })
    const secret = path.join(root, 'secret.json')

    fs.writeFileSync(secret, JSON.stringify({ version: 1, text: 'secret', createdAt: now }))
    fs.symlinkSync(secret, path.join(inbox(), `${ID}.json`))

    expect(readSelectionHandoff(inbox(), ID, now)).toEqual({ ok: false, error: 'invalid' })
    expect(fs.existsSync(secret)).toBe(true)
  })
})

describe('createSelectionDraftRelay', () => {
  it('holds a cold-launch hand-off until the renderer is ready, then delivers it once', () => {
    const now = Date.now()
    const inbox = path.join(root, 'inbox')
    let ready = false
    const send = vi.fn()
    const relay = createSelectionDraftRelay({ inboxDir: () => inbox, isReady: () => ready, log: vi.fn(), send })

    writeHandoff(inbox, { version: 1, text: 'from Notes', createdAt: now })
    relay.handleDeepLink('new', { id: ID })

    expect(send).not.toHaveBeenCalled()
    // Consumed on arrival, not on delivery: the link cannot be replayed.
    expect(fs.existsSync(path.join(inbox, `${ID}.json`))).toBe(false)

    ready = true
    relay.flush()
    relay.flush()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ ok: true, text: 'from Notes' }))
  })

  it('relays a refusal too, so the renderer can say why nothing opened', () => {
    const send = vi.fn()
    const relay = createSelectionDraftRelay({ inboxDir: () => root, isReady: () => true, log: vi.fn(), send })

    relay.handleDeepLink('new', { id: 'not-a-uuid' })

    expect(send).toHaveBeenCalledWith({ ok: false, error: 'invalid' })
  })

  it('ignores unknown selection/* paths', () => {
    const send = vi.fn()
    const relay = createSelectionDraftRelay({ inboxDir: () => root, isReady: () => true, log: vi.fn(), send })

    relay.handleDeepLink('delete', { id: ID })

    expect(send).not.toHaveBeenCalled()
  })
})
