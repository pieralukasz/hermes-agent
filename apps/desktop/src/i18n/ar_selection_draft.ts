// "New chat from selection" copy (en_selection_draft.ts is the source).
export const arSelectionDraft = {
  contextMenuItem: 'محادثة جديدة بالتحديد',
  roleUser: 'رسالتك',
  roleAssistant: 'رسالة المساعد',
  untitledConversation: 'محادثة بلا عنوان',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link ? `المصدر: ${role} في محادثة Hermes «${title}» — ${link}` : `المصدر: ${role} في محادثة Hermes «${title}»`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `المصدر: ${app || 'تطبيق آخر'} — ${location}` : `المصدر: ${app || 'تطبيق آخر'}`,
  refusedTitle: 'تعذّر بدء محادثة من التحديد',
  noSelection: 'حدّد أولاً نصاً في رسالة المستخدم أو المساعد.',
  outsideMessage:
    'حدّد نصاً داخل رسالة المستخدم أو المساعد. لا يُقتبس النص من المحرّر أو الشريط الجانبي أو اللوحات الأخرى.',
  multipleMessages: 'يمتد التحديد على أكثر من رسالة. حدّد نصاً داخل رسالة واحدة.',
  tooLarge: (length: number) => `التحديد طويل جداً (${length} حرفاً؛ الحد 100,000).`,
  nativeEmpty: 'لم يُسلّم macOS أي نص. حدّد نصاً في التطبيق الآخر ثم شغّل الخدمة مرة أخرى.',
  nativeExpired: 'انتهت صلاحية التسليم من macOS أو لم يكن صالحاً. شغّل الخدمة مرة أخرى.',
  service: {
    title: 'خدمة macOS: محادثة Hermes جديدة من التحديد',
    description: (name: string) =>
      `تضيف «${name}» إلى قائمة الخدمات (نقرة يمنى › الخدمات، أو قائمة التطبيق › الخدمات) في التطبيقات التي تدعم خدمات macOS. يُفتح النص المحدد في مسودة Hermes جديدة غير مُرسلة. بلا إذن تسهيلات الاستخدام وبلا وصول إلى الحافظة.`,
    shortcut: (shortcut: string) =>
      `الاختصار الافتراضي ${shortcut}. غيّره أو عطّله من إعدادات النظام › لوحة المفاتيح › اختصارات لوحة المفاتيح › الخدمات.`,
    install: 'تثبيت',
    reinstall: 'إعادة التثبيت',
    remove: 'إزالة',
    installedAt: (path: string) => `مثبّت في ${path}`,
    notInstalled: 'غير مثبّت',
    includeContextTitle: 'تضمين عنوان الصفحة أو مسار المستند',
    includeContextDescription:
      'يسأل التطبيق الأمامي عن عنوان صفحته أو مسار مستنده. يسأل macOS مرة لكل تطبيق عن السماح للخدمة بالتحكم فيه؛ ويمكنك الرفض. يُطبَّق عند التثبيت التالي.',
    unsupportedApps:
      'لا توفّر بعض التطبيقات خدمات لتحديدها (مثل الألعاب أو بعض التطبيقات متعددة المنصات)، ولا توفّرها حقول كلمات المرور أبداً.',
    failed: (error: string) => `تعذّر تحديث خدمة macOS: ${error}`
  }
}
