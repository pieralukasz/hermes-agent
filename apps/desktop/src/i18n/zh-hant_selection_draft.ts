// "New chat from selection" copy (en_selection_draft.ts is the source).
export const zhHantSelectionDraft = {
  contextMenuItem: '用所選內容新增聊天',
  roleUser: '你的訊息',
  roleAssistant: '助理訊息',
  untitledConversation: '未命名對話',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link ? `來源：Hermes 對話「${title}」中的${role} — ${link}` : `來源：Hermes 對話「${title}」中的${role}`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `來源：${app || '其他 App'} — ${location}` : `來源：${app || '其他 App'}`,
  refusedTitle: '無法用所選內容開始聊天',
  noSelection: '請先在使用者或助理訊息中選取文字。',
  outsideMessage: '請在使用者或助理訊息內選取文字。輸入框、側邊欄與其他面板中的文字不會被引用。',
  multipleMessages: '所選內容跨越了多則訊息。請在單一訊息內選取文字。',
  tooLarge: (length: number) => `所選內容過長（${length} 個字元；上限為 100,000）。`,
  nativeEmpty: 'macOS 未傳遞任何文字。請在另一個 App 中選取文字，然後再次執行該服務。',
  nativeExpired: '來自 macOS 的傳遞已過期或無效。請再次執行該服務。',
  service: {
    title: 'macOS 服務：用所選內容新增 Hermes 聊天',
    description: (name: string) =>
      `在支援 macOS 服務的 App 中，將「${name}」加入「服務」選單（按右鍵 › 服務，或 App 選單 › 服務）。所選文字會在新的未傳送 Hermes 草稿中開啟。不需要輔助使用權限，也不存取剪貼簿。`,
    shortcut: (shortcut: string) => `預設快速鍵 ${shortcut}。可在 系統設定 › 鍵盤 › 鍵盤快速鍵 › 服務 中更改或停用。`,
    install: '安裝',
    reinstall: '重新安裝',
    remove: '移除',
    installedAt: (path: string) => `已安裝於 ${path}`,
    notInstalled: '未安裝',
    includeContextTitle: '附上頁面網址或文件路徑',
    includeContextDescription:
      '向最前方的 App 詢問其頁面網址或文件路徑。macOS 會針對每個 App 詢問一次是否允許該服務控制它；你可以拒絕。將於下次安裝時生效。',
    unsupportedApps: '有些 App 不會為所選內容提供服務（例如遊戲或部分跨平台 App），密碼欄位則從不提供。',
    failed: (error: string) => `無法更新 macOS 服務：${error}`
  }
}
