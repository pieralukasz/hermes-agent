// "New chat from selection" copy (en_selection_draft.ts is the source).
export const esSelectionDraft = {
  contextMenuItem: 'Nuevo chat con la selección',
  roleUser: 'tu mensaje',
  roleAssistant: 'mensaje del asistente',
  untitledConversation: 'Conversación sin título',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link
      ? `Fuente: ${role} en la conversación de Hermes «${title}» — ${link}`
      : `Fuente: ${role} en la conversación de Hermes «${title}»`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `Fuente: ${app || 'otra app'} — ${location}` : `Fuente: ${app || 'otra app'}`,
  refusedTitle: 'No se pudo iniciar un chat con la selección',
  noSelection: 'Primero selecciona texto en un mensaje del usuario o del asistente.',
  outsideMessage:
    'Selecciona texto dentro de un mensaje del usuario o del asistente. El texto del editor, la barra lateral u otros paneles no se cita.',
  multipleMessages: 'La selección abarca más de un mensaje. Selecciona texto dentro de un solo mensaje.',
  tooLarge: (length: number) => `La selección es demasiado larga (${length} caracteres; el límite es 100.000).`,
  nativeEmpty: 'macOS no entregó texto. Selecciona texto en la otra app y vuelve a ejecutar el Servicio.',
  nativeExpired: 'La entrega desde macOS caducó o no era válida. Vuelve a ejecutar el Servicio.',
  service: {
    title: 'Servicio de macOS: nuevo chat de Hermes desde la selección',
    description: (name: string) =>
      `Añade «${name}» al menú Servicios (clic derecho › Servicios, o menú de la app › Servicios) en las apps que admiten Servicios de macOS. El texto seleccionado se abre en un nuevo borrador de Hermes sin enviar. Sin permiso de Accesibilidad y sin acceso al portapapeles.`,
    shortcut: (shortcut: string) =>
      `Atajo predeterminado ${shortcut}. Cámbialo o desactívalo en Ajustes del Sistema › Teclado › Funciones rápidas de teclado › Servicios.`,
    install: 'Instalar',
    reinstall: 'Reinstalar',
    remove: 'Quitar',
    installedAt: (path: string) => `Instalado en ${path}`,
    notInstalled: 'No instalado',
    includeContextTitle: 'Incluir URL de la página o ruta del documento',
    includeContextDescription:
      'Pide a la app en primer plano la URL de la página o la ruta del documento. macOS pregunta una vez por app si el Servicio puede controlarla; puedes negarte. Se aplica en la próxima instalación.',
    unsupportedApps:
      'Algunas apps no ofrecen Servicios para su selección (por ejemplo juegos o algunas apps multiplataforma) y los campos de contraseña nunca lo hacen.',
    failed: (error: string) => `No se pudo actualizar el Servicio de macOS: ${error}`
  }
}
