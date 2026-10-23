// "New chat from selection" copy (en_selection_draft.ts is the source).
export const enSelectionDraft = {
  contextMenuItem: 'New chat with selection',
  roleUser: 'your message',
  roleAssistant: 'assistant message',
  untitledConversation: 'Untitled conversation',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link
      ? `Source: ${role} in the Hermes conversation “${title}” — ${link}`
      : `Source: ${role} in the Hermes conversation “${title}”`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `Source: ${app || 'another app'} — ${location}` : `Source: ${app || 'another app'}`,
  refusedTitle: 'Couldn’t start a chat from the selection',
  noSelection: 'Select text in a user or assistant message first.',
  outsideMessage:
    'Select text inside a user or assistant message. Text from the composer, the sidebar or other panels is not quoted.',
  multipleMessages: 'The selection spans more than one message. Select text inside a single message.',
  tooLarge: (length: number) => `The selection is too long (${length} characters; the limit is 100,000).`,
  nativeEmpty: 'macOS handed over no text. Select text in the other app, then run the Service again.',
  nativeExpired: 'The hand-off from macOS expired or was not valid. Run the Service again.',
  service: {
    title: 'macOS Service: New Hermes chat from selection',
    description: (name: string) =>
      `Adds “${name}” to the Services menu (right-click › Services, or App menu › Services) in apps that support macOS Services. The selected text opens in a new, unsent Hermes draft. No Accessibility permission and no clipboard access.`,
    shortcut: (shortcut: string) =>
      `Default shortcut ${shortcut}. Change or disable it in System Settings › Keyboard › Keyboard Shortcuts › Services.`,
    install: 'Install',
    reinstall: 'Reinstall',
    remove: 'Remove',
    installedAt: (path: string) => `Installed at ${path}`,
    notInstalled: 'Not installed',
    includeContextTitle: 'Include page URL or document path',
    includeContextDescription:
      'Asks the front app for its page URL or document path. macOS asks once per app whether the Service may control it; you can refuse. Applies the next time you install.',
    unsupportedApps:
      'Some apps do not offer Services for their selection (for example games or some cross-platform apps), and password fields never do.',
    failed: (error: string) => `Could not update the macOS Service: ${error}`
  }
}
