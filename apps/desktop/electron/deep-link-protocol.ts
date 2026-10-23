/**
 * `hermes://` deep-link registration. Every launch rewrites the OS handler (on Windows,
 * HKCU\Software\Classes\<protocol>), so a test or dev run of an unpackaged checkout would
 * repoint the user's installed handler at that checkout. `HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION=1`
 * (set by the E2E harnesses) leaves the OS registration untouched; deep links that arrive
 * through argv / second-instance still route normally.
 */

export interface ProtocolRegistrar {
  setAsDefaultProtocolClient: (protocol: string, path?: string, args?: string[]) => boolean
}

export interface DeepLinkProtocolOptions {
  app: ProtocolRegistrar
  protocol: string
  env: NodeJS.ProcessEnv
  /** `process.defaultApp`: running as `electron <dir>` rather than a packaged binary. */
  defaultApp: boolean
  argv: string[]
  execPath: string
  resolve: (entry: string) => string
  log: (line: string) => void
}

export function registerDeepLinkProtocol(options: DeepLinkProtocolOptions): void {
  const { app, protocol, env, defaultApp, argv, execPath, resolve, log } = options

  if (env.HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION === '1') {
    log(`[deeplink] ${protocol}:// registration skipped (HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION)`)

    return
  }

  try {
    if (defaultApp && argv.length >= 2) {
      // Dev: register with the electron exec path + entry script so the OS can
      // relaunch us with the URL. argv[1] is usually "." when launched via
      // `electron .` from apps/desktop — resolve against cwd.
      app.setAsDefaultProtocolClient(protocol, execPath, [resolve(argv[1])])
    } else {
      app.setAsDefaultProtocolClient(protocol)
    }

    log(`[deeplink] registered ${protocol}:// handler`)
  } catch (err) {
    log(`[deeplink] protocol registration failed: ${(err as Error).message}`)
  }
}

/** The first argv entry that is a deep link in one of `schemes` (Win/Linux argv delivery). */
export function extractDeepLink(argv: unknown, schemes: readonly string[]): null | string {
  if (!Array.isArray(argv)) {
    return null
  }

  return argv.find((a): a is string => typeof a === 'string' && schemes.some(s => a.startsWith(`${s}://`))) ?? null
}

export interface DeepLinkPayload {
  kind: string
  name: string
  params: Record<string, string>
}

/**
 * `<scheme>://<kind>/<name>?k=v` → `{ kind, name, params }`, or null (logged)
 * for a malformed URL or a scheme this build does not own.
 * e.g. hermes://blueprint/<key>?slot=val -> kind "blueprint", name "<key>".
 */
export function parseDeepLink(
  url: string,
  schemes: readonly string[],
  log: (line: string) => void
): DeepLinkPayload | null {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    log(`[deeplink] ignoring malformed url: ${url}`)

    return null
  }

  const scheme = parsed.protocol.replace(/:$/, '')

  if (!schemes.includes(scheme)) {
    log(`[deeplink] ignoring scheme ${scheme} (expected ${schemes.join(' or ')})`)

    return null
  }

  const params: Record<string, string> = {}

  parsed.searchParams.forEach((value, key) => {
    params[key] = value
  })

  return {
    kind: parsed.hostname || '',
    name: decodeURIComponent((parsed.pathname || '').replace(/^\//, '')),
    params
  }
}
