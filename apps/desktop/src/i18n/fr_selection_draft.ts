// "New chat from selection" copy (en_selection_draft.ts is the source).
export const frSelectionDraft = {
  contextMenuItem: 'Nouveau chat avec la sélection',
  roleUser: 'votre message',
  roleAssistant: 'message de l’assistant',
  untitledConversation: 'Conversation sans titre',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link
      ? `Source : ${role} dans la conversation Hermes « ${title} » — ${link}`
      : `Source : ${role} dans la conversation Hermes « ${title} »`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `Source : ${app || 'une autre app'} — ${location}` : `Source : ${app || 'une autre app'}`,
  refusedTitle: 'Impossible de démarrer un chat avec la sélection',
  noSelection: 'Sélectionnez d’abord du texte dans un message de l’utilisateur ou de l’assistant.',
  outsideMessage:
    'Sélectionnez du texte dans un message de l’utilisateur ou de l’assistant. Le texte du compositeur, de la barre latérale ou d’autres panneaux n’est pas cité.',
  multipleMessages: 'La sélection couvre plusieurs messages. Sélectionnez du texte dans un seul message.',
  tooLarge: (length: number) => `La sélection est trop longue (${length} caractères ; la limite est 100 000).`,
  nativeEmpty: 'macOS n’a transmis aucun texte. Sélectionnez du texte dans l’autre app, puis relancez le Service.',
  nativeExpired: 'Le transfert depuis macOS a expiré ou n’était pas valide. Relancez le Service.',
  service: {
    title: 'Service macOS : nouveau chat Hermes à partir de la sélection',
    description: (name: string) =>
      `Ajoute « ${name} » au menu Services (clic droit › Services, ou menu de l’app › Services) dans les apps qui prennent en charge les Services macOS. Le texte sélectionné s’ouvre dans un nouveau brouillon Hermes non envoyé. Aucune autorisation d’accessibilité, aucun accès au presse-papiers.`,
    shortcut: (shortcut: string) =>
      `Raccourci par défaut ${shortcut}. Modifiez-le ou désactivez-le dans Réglages Système › Clavier › Raccourcis clavier › Services.`,
    install: 'Installer',
    reinstall: 'Réinstaller',
    remove: 'Supprimer',
    installedAt: (path: string) => `Installé dans ${path}`,
    notInstalled: 'Non installé',
    includeContextTitle: 'Inclure l’URL de la page ou le chemin du document',
    includeContextDescription:
      'Demande à l’app au premier plan l’URL de sa page ou le chemin de son document. macOS demande une fois par app si le Service peut la contrôler ; vous pouvez refuser. S’applique à la prochaine installation.',
    unsupportedApps:
      'Certaines apps ne proposent pas de Services pour leur sélection (par exemple les jeux ou certaines apps multiplateformes), et les champs de mot de passe jamais.',
    failed: (error: string) => `Impossible de mettre à jour le Service macOS : ${error}`
  }
}
