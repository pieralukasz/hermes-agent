import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

import type { SelectionServiceStatus } from '../../../electron/selection-service-types'

import { ListRow, ToggleRow } from './primitives'

/**
 * macOS Services "New Hermes chat from selection".
 *
 * Main owns the workflow bundle and the Services shortcut; this row only asks
 * for the live status and requests install / remove. Nothing is installed
 * until the person presses Install, and the page-URL / document-path context
 * (the only part that triggers a macOS Automation prompt) is a separate,
 * default-off opt-in.
 */
export function SelectionServiceSettings() {
  const { t } = useI18n()
  const copy = t.selectionDraft.service
  const bridge = typeof window === 'undefined' ? undefined : window.hermesDesktop?.selectionService
  const [status, setStatus] = useState<null | SelectionServiceStatus>(null)
  const [includeContext, setIncludeContext] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bridge) {
      return
    }

    let live = true

    void bridge
      .status()
      .then(next => {
        if (live) {
          setStatus(next)
          setIncludeContext(next.includeContext)
        }
      })
      .catch((reason: unknown) => live && setError(copy.failed(String((reason as Error)?.message ?? reason))))

    return () => {
      live = false
    }
  }, [bridge, copy])

  if (!bridge || !status?.supported) {
    return null
  }

  const run = async (action: () => Promise<SelectionServiceStatus>) => {
    setBusy(true)
    setError('')

    try {
      setStatus(await action())
    } catch (reason) {
      setError(copy.failed(String((reason as Error)?.message ?? reason)))
    } finally {
      setBusy(false)
    }
  }

  const caption = 'mt-1 text-[length:var(--conversation-caption-font-size)]'

  return (
    <>
      <ListRow
        action={
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void run(() => bridge.install({ includeContext }))} size="sm">
              {status.installed ? copy.reinstall : copy.install}
            </Button>
            {status.installed ? (
              <Button disabled={busy} onClick={() => void run(() => bridge.uninstall())} size="sm" variant="outline">
                {copy.remove}
              </Button>
            ) : null}
          </div>
        }
        below={
          <div data-testid="selection-service-status">
            <div className={`${caption} text-(--ui-text-tertiary)`}>
              {status.installed ? copy.installedAt(status.workflowPath) : copy.notInstalled}
            </div>
            <div className={`${caption} text-(--ui-text-tertiary)`}>{copy.shortcut(status.shortcut)}</div>
            <div className={`${caption} text-(--ui-text-tertiary)`}>{copy.unsupportedApps}</div>
            {error ? <div className={`${caption} text-amber-500/90`}>{error}</div> : null}
          </div>
        }
        description={copy.description(status.serviceName)}
        title={copy.title}
      />
      <ToggleRow
        checked={includeContext}
        description={copy.includeContextDescription}
        disabled={busy}
        label={copy.includeContextTitle}
        onChange={setIncludeContext}
      />
    </>
  )
}
