import assert from 'node:assert/strict'

import { test } from 'vitest'

import { extractDeepLink, parseDeepLink, registerDeepLinkProtocol } from './deep-link-protocol'

function run(env: NodeJS.ProcessEnv, defaultApp = true) {
  const calls: unknown[][] = []
  const log: string[] = []
  registerDeepLinkProtocol({
    app: {
      setAsDefaultProtocolClient: (...args: unknown[]) => {
        calls.push(args)

        return true
      }
    },
    protocol: 'hermes',
    env,
    defaultApp,
    argv: ['/electron', '.'],
    execPath: '/electron',
    resolve: entry => `/checkout/${entry}`,
    log: line => log.push(line)
  })

  return { calls, log }
}

test('the E2E/dev guard leaves the OS hermes:// handler untouched; normal launches still register', () => {
  const skipped = run({ HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION: '1' })
  assert.deepEqual(skipped.calls, [])
  assert.match(skipped.log.join('\n'), /registration skipped/)

  assert.deepEqual(run({}).calls, [['hermes', '/electron', ['/checkout/.']]])
  assert.deepEqual(run({}, false).calls, [['hermes']])
})

test('parseDeepLink splits kind/name/params and refuses foreign or malformed links', () => {
  const log: string[] = []

  assert.deepEqual(
    parseDeepLink('hermes://selection/new?id=abc&x=1', ['hermes'], line => log.push(line)),
    {
      kind: 'selection',
      name: 'new',
      params: { id: 'abc', x: '1' }
    }
  )
  assert.deepEqual(parseDeepLink('hermes://open/a%20b', ['hermes'], line => log.push(line))?.name, 'a b')
  assert.equal(
    parseDeepLink('evil://selection/new', ['hermes'], line => log.push(line)),
    null
  )
  assert.equal(
    parseDeepLink('not a url', ['hermes'], line => log.push(line)),
    null
  )
  assert.equal(log.length, 2)
})

test('extractDeepLink finds the first argv entry in an owned scheme', () => {
  assert.equal(extractDeepLink(['app', '--x', 'hermes-dev://open/1', 'hermes://open/2'], ['hermes']), 'hermes://open/2')
  assert.equal(extractDeepLink(['app'], ['hermes']), null)
  assert.equal(extractDeepLink(undefined, ['hermes']), null)
})
