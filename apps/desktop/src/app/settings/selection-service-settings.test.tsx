import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SelectionServiceStatus } from '../../../electron/selection-service-types'

import { SelectionServiceSettings } from './selection-service-settings'

const desktopWindow = window as unknown as { hermesDesktop?: Window['hermesDesktop'] }

const BASE: SelectionServiceStatus = {
  supported: true,
  installed: false,
  stale: false,
  includeContext: false,
  serviceName: 'New Hermes Chat from Selection',
  workflowPath: '/Users/me/Library/Services/New Hermes Chat from Selection.workflow',
  shortcut: '⌃⌥⌘H'
}

function installBridge(status: SelectionServiceStatus) {
  const bridge = {
    status: vi.fn().mockResolvedValue(status),
    install: vi.fn().mockResolvedValue({ ...status, installed: true }),
    uninstall: vi.fn().mockResolvedValue({ ...status, installed: false }),
    onDraft: vi.fn(() => () => undefined)
  }

  desktopWindow.hermesDesktop = { selectionService: bridge } as unknown as Window['hermesDesktop']

  return bridge
}

afterEach(() => {
  cleanup()
  delete desktopWindow.hermesDesktop
})

describe('SelectionServiceSettings', () => {
  it('renders nothing off macOS', async () => {
    const bridge = installBridge({ ...BASE, supported: false })
    const { container } = render(<SelectionServiceSettings />)

    await waitFor(() => expect(bridge.status).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('installs only on request, with URL/document context off unless opted in', async () => {
    const bridge = installBridge(BASE)

    render(<SelectionServiceSettings />)

    expect(await screen.findByText('Not installed')).toBeTruthy()
    expect(screen.getByText(/Default shortcut ⌃⌥⌘H/)).toBeTruthy()
    expect(bridge.install).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith({ includeContext: true }))
    expect(await screen.findByText(/Installed at .*Selection\.workflow/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(bridge.uninstall).toHaveBeenCalled())
    expect(await screen.findByText('Not installed')).toBeTruthy()
  })

  it('shows an install failure instead of swallowing it', async () => {
    const bridge = installBridge(BASE)

    bridge.install.mockRejectedValueOnce(new Error('could not set the Services shortcut: 1'))
    render(<SelectionServiceSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))

    expect(
      await screen.findByText(/Could not update the macOS Service: could not set the Services shortcut/)
    ).toBeTruthy()
  })
})
