// "New chat from selection" copy (en_selection_draft.ts is the source).
export const zhSelectionDraft = {
  contextMenuItem: '用所选内容新建聊天',
  roleUser: '你的消息',
  roleAssistant: '助手消息',
  untitledConversation: '未命名对话',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link ? `来源：Hermes 对话“${title}”中的${role} — ${link}` : `来源：Hermes 对话“${title}”中的${role}`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `来源：${app || '其他应用'} — ${location}` : `来源：${app || '其他应用'}`,
  refusedTitle: '无法用所选内容开始聊天',
  noSelection: '请先在用户或助手消息中选择文本。',
  outsideMessage: '请在用户或助手消息内选择文本。输入框、侧边栏和其他面板中的文本不会被引用。',
  multipleMessages: '所选内容跨越了多条消息。请在单条消息内选择文本。',
  tooLarge: (length: number) => `所选内容过长（${length} 个字符；上限为 100,000）。`,
  nativeEmpty: 'macOS 未传递任何文本。请在另一个应用中选择文本，然后再次运行该服务。',
  nativeExpired: '来自 macOS 的传递已过期或无效。请再次运行该服务。',
  service: {
    title: 'macOS 服务：用所选内容新建 Hermes 聊天',
    description: (name: string) =>
      `在支持 macOS 服务的应用中，将“${name}”添加到“服务”菜单（右键 › 服务，或应用菜单 › 服务）。所选文本会在新的未发送 Hermes 草稿中打开。无需辅助功能权限，也不访问剪贴板。`,
    shortcut: (shortcut: string) => `默认快捷键 ${shortcut}。可在 系统设置 › 键盘 › 键盘快捷键 › 服务 中更改或停用。`,
    install: '安装',
    reinstall: '重新安装',
    remove: '移除',
    installedAt: (path: string) => `已安装在 ${path}`,
    notInstalled: '未安装',
    includeContextTitle: '附带页面网址或文稿路径',
    includeContextDescription:
      '向前台应用询问其页面网址或文稿路径。macOS 会针对每个应用询问一次是否允许该服务控制它；你可以拒绝。将在下次安装时生效。',
    unsupportedApps: '有些应用不为其所选内容提供服务（例如游戏或部分跨平台应用），密码字段则从不提供。',
    failed: (error: string) => `无法更新 macOS 服务：${error}`
  }
}
