/**
 * macOS Services hand-off: "New Hermes chat from selection" in other apps.
 *
 * The path deliberately avoids Accessibility, synthetic ⌘C and clipboard
 * monitoring. A Services workflow (an Automator `.workflow` bundle the user
 * installs from Settings) receives the selection from macOS itself — macOS
 * only offers a Service when the front app hands over selected text, and never
 * for secure (password) fields. The workflow writes one JSON hand-off into
 * this app's own inbox and opens `<scheme>://selection/new?id=<uuid>`; main
 * reads, validates and deletes that file, then relays the text to the renderer,
 * which opens it as an UNSENT draft in a new chat.
 *
 * Why a file and not the text in the URL: a web page can open any `hermes://`
 * link, but only a local process of this user can write into the inbox, so a
 * link alone can never inject a draft. The URL carries only a random id.
 *
 * Source provenance: the front app's name and bundle id come from
 * NSWorkspace (no permission). Page URL / document path need Apple Events to
 * that app, which macOS gates behind a per-app Automation consent prompt — so
 * they are opt-in at install time and silently absent when refused.
 *
 * Source checkouts and installed builds keep separate identities: the menu
 * title, workflow path, URL scheme and inbox all derive from this app's own
 * product identity + userData, so a `hermes-dev` build never overwrites the
 * installed app's Service or reads its inbox.
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { SelectionServiceStatus } from './selection-service-types'

/** Mirrors MAX_SELECTION_DRAFT_CHARS in src/lib/selection-draft.ts. */
export const MAX_HANDOFF_TEXT_CHARS = 100_000
/** UTF-8 JSON of 100k chars, escaped, stays well under this. */
export const MAX_HANDOFF_BYTES = 4 * 1024 * 1024
export const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000
const HANDOFF_FUTURE_SKEW_MS = 60 * 1000
const STALE_FILE_MS = 10 * 60 * 1000
const MAX_SOURCE_FIELD_CHARS = 2048
const HANDOFF_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/

/** ⌃⌥⌘H in pbs notation (@ = ⌘, ~ = ⌥, ^ = ⌃). Info.plist key equivalents can
 *  only express ⌘(+⇧), which every app's own menus shadow, so the default is
 *  written as the user's Services shortcut instead (System Settings shows and
 *  edits the same entry). */
export const SELECTION_SERVICE_KEY_EQUIVALENT = '@~^h'
export const SELECTION_SERVICE_SHORTCUT_LABEL = '⌃⌥⌘H'
export const SELECTION_SERVICE_MESSAGE = 'runWorkflowAsService'

export interface SelectionServiceIdentity {
  serviceName: string
  bundleId: string
  workflowPath: string
  inboxDir: string
  protocol: string
}

export function selectionServiceIdentity({
  appId,
  displayName,
  homeDir,
  protocol,
  userDataDir
}: {
  appId: string
  displayName: string
  homeDir: string
  protocol: string
  userDataDir: string
}): SelectionServiceIdentity {
  if (!SCHEME_RE.test(protocol)) {
    throw new Error(`invalid deep-link scheme: ${protocol}`)
  }

  // The stable app owns the plain title; any other scheme (dev server) says so,
  // so the two never share a workflow path or a Services menu row.
  const suffix = protocol === 'hermes' ? '' : ` (${protocol})`
  const serviceName = `New ${displayName} Chat from Selection${suffix}`

  return {
    serviceName,
    bundleId: `${appId}.selection-service${protocol === 'hermes' ? '' : `.${protocol}`}`,
    workflowPath: path.join(homeDir, 'Library', 'Services', `${serviceName.replace(/[/:]/g, '-')}.workflow`),
    inboxDir: path.join(userDataDir, 'selection-inbox'),
    protocol
  }
}

// ── plist (XML) ────────────────────────────────────────────────────────────

type PlistValue = boolean | number | string | PlistValue[] | { [key: string]: PlistValue }

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function plistNode(value: PlistValue, indent: string): string {
  if (typeof value === 'boolean') {
    return `${indent}<${value ? 'true' : 'false'}/>`
  }

  if (typeof value === 'number') {
    return `${indent}<integer>${Math.trunc(value)}</integer>`
  }

  if (typeof value === 'string') {
    return `${indent}<string>${escapeXml(value)}</string>`
  }

  const inner = `${indent}\t`

  if (Array.isArray(value)) {
    return `${indent}<array>\n${value.map(item => plistNode(item, inner)).join('\n')}\n${indent}</array>`
  }

  const entries = Object.entries(value).map(
    ([key, item]) => `${inner}<key>${escapeXml(key)}</key>\n${plistNode(item, inner)}`
  )

  return entries.length ? `${indent}<dict>\n${entries.join('\n')}\n${indent}</dict>` : `${indent}<dict/>`
}

export function toPlistXml(value: PlistValue): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">\n${plistNode(value, '')}\n</plist>\n`
  )
}

// ── workflow bundle ─────────────────────────────────────────────────────────

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/** JXA run inside the workflow: build the hand-off and open the app. */
const HANDOFF_JXA = String.raw`ObjC.import('AppKit')
function field(value) {
  const text = value === undefined || value === null ? '' : String(value)
  return text.length > 2048 ? text.slice(0, 2048) : text
}
function frontContext(bundleId) {
  const chromeLike = ['com.google.Chrome', 'com.brave.Browser', 'com.microsoft.edgemac', 'company.thebrowser.Browser', 'com.vivaldi.Vivaldi']
  try {
    if (bundleId === 'com.apple.Safari' || bundleId === 'com.apple.SafariTechnologyPreview') {
      return { url: field(Application(bundleId).documents[0].url()), document: '' }
    }
    if (chromeLike.indexOf(bundleId) !== -1) {
      return { url: field(Application(bundleId).windows[0].activeTab.url()), document: '' }
    }
    const doc = Application(bundleId).documents[0]
    let file = ''
    try { file = doc.file() ? doc.file().toString() : '' } catch (error) { file = '' }
    if (!file) { try { file = doc.path() || '' } catch (error) { file = '' } }
    return { url: '', document: field(file) }
  } catch (error) {
    return { url: '', document: '' }
  }
}
function run(argv) {
  const inbox = argv[0], id = argv[1], scheme = argv[2], withContext = argv[3] === '1'
  const textPath = inbox + '/.' + id + '.txt'
  const raw = $.NSString.stringWithContentsOfFileEncodingError(textPath, $.NSUTF8StringEncoding, null)
  const text = raw.isNil() ? '' : ObjC.unwrap(raw)
  $.NSFileManager.defaultManager.removeItemAtPathError(textPath, null)
  const front = $.NSWorkspace.sharedWorkspace.frontmostApplication
  const appName = front.isNil() ? '' : field(ObjC.unwrap(front.localizedName))
  const bundleId = front.isNil() ? '' : field(ObjC.unwrap(front.bundleIdentifier))
  const context = withContext && bundleId ? frontContext(bundleId) : { url: '', document: '' }
  const payload = JSON.stringify({ version: 1, text: text, createdAt: Date.now(), source: { appName: appName, bundleId: bundleId, url: context.url, document: context.document } })
  $(payload).writeToFileAtomicallyEncodingError(inbox + '/' + id + '.json', true, $.NSUTF8StringEncoding, null)
  const opened = $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString(scheme + '://selection/new?id=' + id))
  return opened ? '' : 'No app is registered for ' + scheme + '://'
}`

export function selectionServiceScript(identity: SelectionServiceIdentity, includeContext: boolean): string {
  return [
    `# Generated by Hermes (${identity.serviceName}).`,
    '# Hands the selected text to Hermes as an UNSENT draft. No clipboard, no keystrokes.',
    'umask 077',
    `inbox=${shellQuote(identity.inboxDir)}`,
    'mkdir -p -- "$inbox" || exit 1',
    'id=$(/usr/bin/uuidgen) || exit 1',
    '/bin/cat > "$inbox/.$id.txt" || exit 1',
    `/usr/bin/osascript -l JavaScript - "$inbox" "$id" ${shellQuote(identity.protocol)} ${includeContext ? '1' : '0'} <<'HERMES_JXA'`,
    HANDOFF_JXA,
    'HERMES_JXA',
    ''
  ].join('\n')
}

export interface SelectionServiceMarker {
  version: 1
  includeContext: boolean
  protocol: string
  inboxDir: string
}

const MARKER_FILE = 'hermes-selection-service.json'

function runShellScriptAction(script: string): PlistValue {
  return {
    action: {
      AMAccepts: { Container: 'List', Optional: true, Types: ['com.apple.cocoa.string'] },
      AMActionVersion: '2.0.3',
      AMApplication: ['Automator'],
      AMParameterProperties: {
        COMMAND_STRING: {},
        CheckedForUserDefaultShell: {},
        inputMethod: {},
        shell: {},
        source: {}
      },
      AMProvides: { Container: 'List', Types: ['com.apple.cocoa.string'] },
      ActionBundlePath: '/System/Library/Automator/Run Shell Script.action',
      ActionName: 'Run Shell Script',
      ActionParameters: {
        COMMAND_STRING: script,
        CheckedForUserDefaultShell: true,
        // 0 = pass input to stdin: the selection never appears in argv/`ps`.
        inputMethod: 0,
        shell: '/bin/zsh',
        source: ''
      },
      BundleIdentifier: 'com.apple.RunShellScript',
      CFBundleVersion: '2.0.3',
      CanShowSelectedItemsWhenRun: false,
      CanShowWhenRun: true,
      Category: ['AMCategoryUtilities'],
      'Class Name': 'RunShellScriptAction',
      InputUUID: randomUUID().toUpperCase(),
      Keywords: ['Shell', 'Script', 'Command', 'Run', 'Unix'],
      OutputUUID: randomUUID().toUpperCase(),
      UUID: randomUUID().toUpperCase(),
      UnlocalizedApplications: ['Automator'],
      arguments: {
        '0': { 'default value': 0, name: 'inputMethod', required: '0', type: '0', uuid: '0' },
        '1': { 'default value': '', name: 'source', required: '0', type: '0', uuid: '1' },
        '2': { 'default value': false, name: 'CheckedForUserDefaultShell', required: '0', type: '0', uuid: '2' },
        '3': { 'default value': '', name: 'COMMAND_STRING', required: '0', type: '0', uuid: '3' },
        '4': { 'default value': '/bin/sh', name: 'shell', required: '0', type: '0', uuid: '4' }
      },
      isViewVisible: true,
      location: '309.500000:631.000000',
      nibPath: '/System/Library/Automator/Run Shell Script.action/Contents/Resources/en.lproj/main.nib'
    },
    isViewVisible: true
  }
}

/** The bundle's files, relative to the `.workflow` directory. */
export function buildSelectionServiceBundle(
  identity: SelectionServiceIdentity,
  { includeContext }: { includeContext: boolean }
): Record<string, string> {
  const info: PlistValue = {
    NSServices: [
      {
        NSMenuItem: { default: identity.serviceName },
        NSMessage: SELECTION_SERVICE_MESSAGE,
        NSRequiredContext: {},
        NSSendTypes: ['public.utf8-plain-text']
      }
    ],
    CFBundleDevelopmentRegion: 'en_US',
    CFBundleIdentifier: identity.bundleId,
    CFBundleName: identity.serviceName,
    CFBundleShortVersionString: '1.0'
  }

  const document: PlistValue = {
    AMApplicationBuild: '346',
    AMApplicationVersion: '2.3',
    AMDocumentVersion: '2',
    actions: [runShellScriptAction(selectionServiceScript(identity, includeContext))],
    connectors: {},
    workflowMetaData: {
      serviceApplicationBundleID: '',
      serviceApplicationPath: '',
      serviceInputTypeIdentifier: 'com.apple.Automator.text',
      serviceOutputTypeIdentifier: 'com.apple.Automator.nothing',
      serviceProcessesInput: 0,
      workflowTypeIdentifier: 'com.apple.Automator.servicesMenu'
    }
  }

  const marker: SelectionServiceMarker = {
    version: 1,
    includeContext,
    protocol: identity.protocol,
    inboxDir: identity.inboxDir
  }

  return {
    'Contents/Info.plist': toPlistXml(info),
    'Contents/document.wflow': toPlistXml(document),
    [`Contents/${MARKER_FILE}`]: `${JSON.stringify(marker, null, 2)}\n`
  }
}

// ── install / status / remove ───────────────────────────────────────────────

export type ExecResult = { code: number; stdout: string; stderr: string }
export type Exec = (command: string, args: string[]) => Promise<ExecResult>

export const execFileResult: Exec = (command, args) =>
  new Promise(resolve => {
    execFile(command, args, { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error
        ? typeof (error as { code?: unknown }).code === 'number'
          ? (error as { code: number }).code
          : 1
        : 0

      resolve({ code, stdout: String(stdout), stderr: String(stderr || (error ? error.message : '')) })
    })
  })

export type { SelectionServiceStatus }

export function readSelectionServiceStatus(
  identity: SelectionServiceIdentity,
  platform: NodeJS.Platform = process.platform
): SelectionServiceStatus {
  const base = {
    supported: platform === 'darwin',
    installed: false,
    stale: false,
    includeContext: false,
    serviceName: identity.serviceName,
    workflowPath: identity.workflowPath,
    shortcut: SELECTION_SERVICE_SHORTCUT_LABEL
  }

  if (!base.supported || !fs.existsSync(identity.workflowPath)) {
    return base
  }

  try {
    const marker = JSON.parse(
      fs.readFileSync(path.join(identity.workflowPath, 'Contents', MARKER_FILE), 'utf8')
    ) as Partial<SelectionServiceMarker>

    return {
      ...base,
      installed: true,
      stale: marker.version !== 1 || marker.protocol !== identity.protocol || marker.inboxDir !== identity.inboxDir,
      includeContext: marker.includeContext === true
    }
  } catch {
    return { ...base, installed: true, stale: true }
  }
}

/** pbs's NSServicesStatus key for a workflow carrying a CFBundleIdentifier. */
export function servicesStatusKey(identity: SelectionServiceIdentity): string {
  return `${identity.bundleId} - ${identity.serviceName} - ${SELECTION_SERVICE_MESSAGE}`
}

async function servicesStatusHasEntry(exec: Exec, key: string): Promise<boolean> {
  const exported = await exec('/usr/bin/defaults', ['export', 'pbs', '-'])

  if (exported.code !== 0) {
    return false
  }

  return exported.stdout.includes(`<key>${escapeXml(key)}</key>`)
}

/**
 * Write the bundle, set the default shortcut unless the user already has an
 * entry for this Service (theirs wins), and ask pbs to rescan.
 */
export async function installSelectionService(
  identity: SelectionServiceIdentity,
  { exec = execFileResult, includeContext }: { exec?: Exec; includeContext: boolean }
): Promise<void> {
  const files = buildSelectionServiceBundle(identity, { includeContext })
  const staging = `${identity.workflowPath}.tmp-${process.pid}`

  fs.rmSync(staging, { force: true, recursive: true })

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(staging, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, { mode: 0o644 })
  }

  fs.mkdirSync(path.dirname(identity.workflowPath), { recursive: true })
  fs.rmSync(identity.workflowPath, { force: true, recursive: true })
  fs.renameSync(staging, identity.workflowPath)
  fs.mkdirSync(identity.inboxDir, { mode: 0o700, recursive: true })

  const key = servicesStatusKey(identity)

  if (!(await servicesStatusHasEntry(exec, key))) {
    const entry = `{ "enabled_context_menu" = 1; "enabled_services_menu" = 1; "key_equivalent" = "${SELECTION_SERVICE_KEY_EQUIVALENT}"; }`
    const written = await exec('/usr/bin/defaults', ['write', 'pbs', 'NSServicesStatus', '-dict-add', key, entry])

    if (written.code !== 0) {
      throw new Error(`could not set the Services shortcut: ${written.stderr.trim() || written.code}`)
    }
  }

  await exec('/System/Library/CoreServices/pbs', ['-update'])
}

export async function uninstallSelectionService(
  identity: SelectionServiceIdentity,
  { exec = execFileResult }: { exec?: Exec } = {}
): Promise<void> {
  fs.rmSync(identity.workflowPath, { force: true, recursive: true })
  await exec('/System/Library/CoreServices/pbs', ['-update'])
}

// ── hand-off inbox ──────────────────────────────────────────────────────────

export type SelectionHandoffError = 'empty' | 'expired' | 'invalid' | 'missing' | 'tooLarge'

export interface SelectionHandoffSource {
  appName: string
  bundleId: string
  url: string
  document: string
}

export type SelectionHandoff =
  | { ok: true; text: string; source: SelectionHandoffSource }
  | { ok: false; error: SelectionHandoffError; length?: number }

function sourceField(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_SOURCE_FIELD_CHARS) : ''
}

/** Drop hand-offs nobody claimed (app was closed, link never delivered). */
export function sweepSelectionInbox(inboxDir: string, now = Date.now()): void {
  let names: string[]

  try {
    names = fs.readdirSync(inboxDir)
  } catch {
    return
  }

  for (const name of names) {
    const file = path.join(inboxDir, name)

    try {
      const stat = fs.lstatSync(file)

      if (now - stat.mtimeMs > STALE_FILE_MS) {
        fs.rmSync(file, { force: true, recursive: true })
      }
    } catch {
      // Raced with another reader; nothing to clean.
    }
  }
}

/**
 * Read, validate and DELETE one hand-off. The id is a bare UUID — never a
 * path — and only a regular file inside the inbox is accepted.
 */
export function readSelectionHandoff(inboxDir: string, id: string, now = Date.now()): SelectionHandoff {
  if (!HANDOFF_ID_RE.test(id)) {
    return { ok: false, error: 'invalid' }
  }

  const file = path.join(inboxDir, `${id}.json`)
  let raw: string

  try {
    const stat = fs.lstatSync(file)

    if (!stat.isFile()) {
      fs.rmSync(file, { force: true, recursive: true })

      return { ok: false, error: 'invalid' }
    }

    if (stat.size > MAX_HANDOFF_BYTES) {
      fs.rmSync(file, { force: true })

      return { ok: false, error: 'tooLarge' }
    }

    raw = fs.readFileSync(file, 'utf8')
    fs.rmSync(file, { force: true })
  } catch {
    return { ok: false, error: 'missing' }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'invalid' }
  }

  const record = parsed as { createdAt?: unknown; source?: unknown; text?: unknown; version?: unknown }

  if (record.version !== 1 || typeof record.text !== 'string' || typeof record.createdAt !== 'number') {
    return { ok: false, error: 'invalid' }
  }

  if (record.createdAt < now - HANDOFF_MAX_AGE_MS || record.createdAt > now + HANDOFF_FUTURE_SKEW_MS) {
    return { ok: false, error: 'expired' }
  }

  if (!record.text.trim()) {
    return { ok: false, error: 'empty' }
  }

  if (record.text.length > MAX_HANDOFF_TEXT_CHARS) {
    return { ok: false, error: 'tooLarge', length: record.text.length }
  }

  const source = record.source && typeof record.source === 'object' ? (record.source as Record<string, unknown>) : {}

  return {
    ok: true,
    text: record.text,
    source: {
      appName: sourceField(source.appName),
      bundleId: sourceField(source.bundleId),
      url: sourceField(source.url),
      document: sourceField(source.document)
    }
  }
}

// ── relay to the renderer ───────────────────────────────────────────────────

export interface SelectionDraftRelay {
  /** `<scheme>://selection/<name>?…` — consumes the hand-off immediately. */
  handleDeepLink: (name: string, params: Record<string, string>) => void
  /** The renderer mounted its listener: flush what arrived during boot. */
  flush: () => void
}

/**
 * The hand-off file is consumed the moment the link arrives (so it cannot be
 * replayed), and the validated result waits in memory until the renderer is
 * ready — a cold launch from the Services menu still lands its draft.
 */
export function createSelectionDraftRelay({
  inboxDir,
  isReady,
  log,
  now = () => Date.now(),
  send
}: {
  inboxDir: () => string
  isReady: () => boolean
  log: (line: string) => void
  now?: () => number
  send: (payload: SelectionHandoff) => void
}): SelectionDraftRelay {
  const pending: SelectionHandoff[] = []

  const deliver = (payload: SelectionHandoff) => {
    if (isReady()) {
      send(payload)
    } else {
      pending.push(payload)
    }
  }

  return {
    handleDeepLink(name, params) {
      if (name !== 'new') {
        log(`[selection-service] ignoring selection/${name}`)

        return
      }

      const dir = inboxDir()
      const payload = readSelectionHandoff(dir, params.id ?? '', now())
      sweepSelectionInbox(dir, now())
      log(`[selection-service] hand-off ${'error' in payload ? `refused (${payload.error})` : 'accepted'}`)
      deliver(payload)
    },
    flush() {
      while (pending.length && isReady()) {
        send(pending.shift()!)
      }
    }
  }
}

// ── main-process wiring ─────────────────────────────────────────────────────

interface IpcLike {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void
  on: (channel: string, listener: (event: { returnValue: unknown }) => void) => void
}

/**
 * Register the Settings IPC (status / install / remove), the synchronous
 * scheme lookup the preload exposes as `deepLinkProtocol`, and return the
 * relay `handleDeepLink` feeds `selection/*` links into.
 */
export function installSelectionServiceBridge({
  appId,
  displayName,
  exec = execFileResult,
  getPath,
  ipc,
  isReady,
  log,
  platform = process.platform,
  protocol,
  send
}: {
  appId: string
  displayName: string
  exec?: Exec
  getPath: (name: 'home' | 'userData') => string
  ipc: IpcLike
  isReady: () => boolean
  log: (line: string) => void
  platform?: NodeJS.Platform
  protocol: string
  send: (payload: SelectionHandoff) => void
}): SelectionDraftRelay {
  const identity = () =>
    selectionServiceIdentity({
      appId,
      displayName,
      homeDir: getPath('home'),
      protocol,
      userDataDir: getPath('userData')
    })

  const requireMac = () => {
    if (platform !== 'darwin') {
      throw new Error('macOS Services are only available on macOS')
    }
  }

  ipc.on('hermes:deep-link-protocol', event => {
    event.returnValue = protocol
  })
  ipc.handle('hermes:selection-service:status', () => readSelectionServiceStatus(identity(), platform))
  ipc.handle('hermes:selection-service:install', async (_event, options) => {
    requireMac()
    const includeContext = Boolean(options && (options as { includeContext?: unknown }).includeContext === true)
    await installSelectionService(identity(), { exec, includeContext })
    log(`[selection-service] installed ${identity().workflowPath} (context=${includeContext})`)

    return readSelectionServiceStatus(identity(), platform)
  })
  ipc.handle('hermes:selection-service:uninstall', async () => {
    requireMac()
    await uninstallSelectionService(identity(), { exec })
    log(`[selection-service] removed ${identity().workflowPath}`)

    return readSelectionServiceStatus(identity(), platform)
  })

  return createSelectionDraftRelay({ inboxDir: () => identity().inboxDir, isReady, log, send })
}
