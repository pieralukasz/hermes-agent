// "New chat from selection" copy (en_selection_draft.ts is the source).
export const jaSelectionDraft = {
  contextMenuItem: '選択範囲で新しいチャット',
  roleUser: 'あなたのメッセージ',
  roleAssistant: 'アシスタントのメッセージ',
  untitledConversation: '無題の会話',
  hermesSource: ({ role, title, link }: { role: string; title: string; link: string }) =>
    link ? `出典: Hermes の会話「${title}」の${role} — ${link}` : `出典: Hermes の会話「${title}」の${role}`,
  nativeSource: ({ app, location }: { app: string; location: string }) =>
    location ? `出典: ${app || '別のアプリ'} — ${location}` : `出典: ${app || '別のアプリ'}`,
  refusedTitle: '選択範囲からチャットを開始できませんでした',
  noSelection: 'まずユーザーまたはアシスタントのメッセージ内のテキストを選択してください。',
  outsideMessage:
    'ユーザーまたはアシスタントのメッセージ内のテキストを選択してください。入力欄、サイドバー、その他のパネルのテキストは引用されません。',
  multipleMessages: '選択範囲が複数のメッセージにまたがっています。1 つのメッセージ内のテキストを選択してください。',
  tooLarge: (length: number) => `選択範囲が長すぎます（${length} 文字。上限は 100,000 文字）。`,
  nativeEmpty:
    'macOS からテキストが渡されませんでした。他のアプリでテキストを選択してから、サービスをもう一度実行してください。',
  nativeExpired: 'macOS からの受け渡しが期限切れか無効でした。サービスをもう一度実行してください。',
  service: {
    title: 'macOS サービス: 選択範囲から新しい Hermes チャット',
    description: (name: string) =>
      `macOS サービスに対応したアプリのサービスメニュー（右クリック › サービス、またはアプリメニュー › サービス）に「${name}」を追加します。選択したテキストは未送信の新しい Hermes 下書きで開きます。アクセシビリティ権限もクリップボードへのアクセスも使いません。`,
    shortcut: (shortcut: string) =>
      `既定のショートカットは ${shortcut} です。システム設定 › キーボード › キーボードショートカット › サービス で変更または無効にできます。`,
    install: 'インストール',
    reinstall: '再インストール',
    remove: '削除',
    installedAt: (path: string) => `${path} にインストール済み`,
    notInstalled: '未インストール',
    includeContextTitle: 'ページの URL または書類のパスを含める',
    includeContextDescription:
      '最前面のアプリにページの URL または書類のパスを問い合わせます。macOS はアプリごとに一度、サービスによる制御を許可するか確認します。拒否もできます。次回のインストールから適用されます。',
    unsupportedApps:
      '選択範囲にサービスを提供しないアプリもあります（ゲームや一部のクロスプラットフォームアプリなど）。パスワード欄は常に対象外です。',
    failed: (error: string) => `macOS サービスを更新できませんでした: ${error}`
  }
}
