// "New chat from selection" copy (en_selection_draft.ts is the source).
export const deSelectionDraft = {
  contextMenuItem: 'Neuer Chat mit Auswahl',
  roleUser: 'deine Nachricht',
  roleAssistant: 'Assistentennachricht',
  untitledConversation: 'Unbenannte Unterhaltung',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link
      ? `Quelle: ${role} in der Hermes-Unterhaltung „${title}“ — ${link}`
      : `Quelle: ${role} in der Hermes-Unterhaltung „${title}“`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `Quelle: ${app || 'eine andere App'} — ${location}` : `Quelle: ${app || 'eine andere App'}`,
  refusedTitle: 'Kein Chat aus der Auswahl möglich',
  noSelection: 'Wähle zuerst Text in einer Nutzer- oder Assistentennachricht aus.',
  outsideMessage:
    'Wähle Text innerhalb einer Nutzer- oder Assistentennachricht aus. Text aus dem Eingabefeld, der Seitenleiste oder anderen Bereichen wird nicht zitiert.',
  multipleMessages: 'Die Auswahl umfasst mehr als eine Nachricht. Wähle Text innerhalb einer einzigen Nachricht aus.',
  tooLarge: (length: number) => `Die Auswahl ist zu lang (${length} Zeichen; Grenze 100.000).`,
  nativeEmpty: 'macOS hat keinen Text übergeben. Wähle in der anderen App Text aus und führe den Dienst erneut aus.',
  nativeExpired: 'Die Übergabe von macOS ist abgelaufen oder ungültig. Führe den Dienst erneut aus.',
  service: {
    title: 'macOS-Dienst: Neuer Hermes-Chat aus Auswahl',
    description: (name: string) =>
      `Fügt „${name}“ dem Dienste-Menü hinzu (Rechtsklick › Dienste oder App-Menü › Dienste) in Apps, die macOS-Dienste unterstützen. Der ausgewählte Text öffnet sich in einem neuen, nicht gesendeten Hermes-Entwurf. Keine Bedienungshilfen-Berechtigung, kein Zugriff auf die Zwischenablage.`,
    shortcut: (shortcut: string) =>
      `Standardkürzel ${shortcut}. Ändern oder deaktivieren unter Systemeinstellungen › Tastatur › Tastaturkurzbefehle › Dienste.`,
    install: 'Installieren',
    reinstall: 'Neu installieren',
    remove: 'Entfernen',
    installedAt: (path: string) => `Installiert unter ${path}`,
    notInstalled: 'Nicht installiert',
    includeContextTitle: 'Seiten-URL oder Dokumentpfad mitsenden',
    includeContextDescription:
      'Fragt die vordere App nach Seiten-URL oder Dokumentpfad. macOS fragt einmal pro App, ob der Dienst sie steuern darf; du kannst ablehnen. Gilt ab der nächsten Installation.',
    unsupportedApps:
      'Manche Apps bieten für ihre Auswahl keine Dienste an (z. B. Spiele oder manche plattformübergreifende Apps), Passwortfelder nie.',
    failed: (error: string) => `Der macOS-Dienst konnte nicht aktualisiert werden: ${error}`
  }
}
