const STRINGS = {
  ja: {
    open: '本を開く', dropHint: 'EPUB・PDF・MOBI・AZW3・FB2・CBZ・TXT・Markdown・HTML・Word・Excel/CSV・ソースコード をここにドロップ', dropSub: 'または「本を開く」から選択',
    library: 'ライブラリ (Esc)', tocBtn: '目次・メモ (T)', settingsBtn: '表示設定', fsBtn: '全画面 (F)',
    tabToc: '目次', tabNotes: 'メモ', noToc: '目次はありません',
    theme: 'テーマ', light: '白', sepia: 'セピア', dark: '黒',
    font: 'フォント', fontBook: '本の指定', fontSerif: '明朝', fontSans: 'ゴシック',
    fontSize: '文字サイズ', spacing: '行間', width: '本文の幅',
    flow: '表示', paginated: 'ページ', scrolled: 'スクロール',
    columns: '段組', col1: '1段', col2: '見開き', justify: '両端揃え', on: 'オン', off: 'オフ',
    zoom: '拡大', fitPage: 'ページ全体', fitWidth: '幅に合わせる',
    spread: 'ページ', single: '単ページ', spreadAuto: '見開き',
    animated: 'ページめくり効果', language: '言語',
    note: 'メモ', copy: 'コピー', notePlaceholder: 'メモを入力…', delete: '削除', save: '保存', cancel: 'キャンセル',
    notesEmpty: 'まだマーカーやメモはありません。\n本文を選択すると追加できます。',
    exportMd: 'Markdown でコピー', copied: 'コピーしました', openFailed: '開けませんでした',
    removeFromList: '一覧から削除',
    textVertical: '縦書き', textMode: 'テキスト表示', prose: '文章', codeMode: 'コード', auto: '自動', vert: '縦', horiz: '横',
    dict: '辞書', wordbook: '単語帳', wordbookBtn: '単語帳 (W)', meaningPlaceholder: '自分用の意味・メモ…',
    reference: '参考: Wiktionary', loadingRef: '取得中…', refFailed: '取得できませんでした（オフライン?）', refNone: '見つかりませんでした',
    clickToAppend: 'クリックで意味欄に追加', saveWord: '単語帳に保存', saved: '単語帳に保存しました',
    importTsv: 'TSV/CSV 読み込み', exportTsv: 'TSV 書き出し', searchWords: '検索…',
    wordbookEmpty: 'まだ単語がありません。\n本文の単語を選んで「辞書」から登録できます。',
    imported: n => `${n} 語を読み込みました`, exported: '書き出しました', fileAt: p => `保存場所: ${p}`, examples: '例文',
    zoomIn: '拡大 (Ctrl +)', zoomOut: '縮小 (Ctrl −)', zoomReset: 'クリックで切替 / 元に戻す (Ctrl 0)',
    fitShort: '全体', widthShort: '幅',
    undone: '取り消しました（やり直し: Ctrl+Shift+Z）', redone: 'やり直しました', nothingToUndo: '取り消す操作はありません', nothingToRedo: 'やり直す操作はありません', page: 'p.', highlightCount: n => `${n} 件`,
  },
  en: {
    open: 'Open book', dropHint: 'Drop an EPUB, PDF, MOBI, AZW3, FB2, CBZ, TXT, Markdown, HTML, Word, Excel/CSV or source code file here', dropSub: 'or click “Open book”',
    library: 'Library (Esc)', tocBtn: 'Contents & notes (T)', settingsBtn: 'Display settings', fsBtn: 'Fullscreen (F)',
    tabToc: 'Contents', tabNotes: 'Notes', noToc: 'No table of contents',
    theme: 'Theme', light: 'Light', sepia: 'Sepia', dark: 'Dark',
    font: 'Font', fontBook: 'Publisher', fontSerif: 'Serif', fontSans: 'Sans',
    fontSize: 'Font size', spacing: 'Line spacing', width: 'Text width',
    flow: 'Layout', paginated: 'Pages', scrolled: 'Scroll',
    columns: 'Columns', col1: 'Single', col2: 'Two', justify: 'Justify', on: 'On', off: 'Off',
    zoom: 'Zoom', fitPage: 'Fit page', fitWidth: 'Fit width',
    spread: 'Pages', single: 'Single', spreadAuto: 'Spread',
    animated: 'Page animation', language: 'Language',
    note: 'Note', copy: 'Copy', notePlaceholder: 'Write a note…', delete: 'Delete', save: 'Save', cancel: 'Cancel',
    notesEmpty: 'No highlights yet.\nSelect text to add one.',
    exportMd: 'Copy as Markdown', copied: 'Copied', openFailed: "Couldn't open",
    removeFromList: 'Remove from list',
    textVertical: 'Vertical text', textMode: 'Text view', prose: 'Prose', codeMode: 'Code', auto: 'Auto', vert: 'Vertical', horiz: 'Horizontal',
    dict: 'Dictionary', wordbook: 'Word book', wordbookBtn: 'Word book (W)', meaningPlaceholder: 'Your meaning / notes…',
    reference: 'Reference: Wiktionary', loadingRef: 'Loading…', refFailed: 'Could not load (offline?)', refNone: 'Not found',
    clickToAppend: 'Click to add to your meaning', saveWord: 'Save to word book', saved: 'Saved to word book',
    importTsv: 'Import TSV/CSV', exportTsv: 'Export TSV', searchWords: 'Search…',
    wordbookEmpty: 'No words yet.\nSelect a word in the text and choose “Dictionary”.',
    imported: n => `Imported ${n} words`, exported: 'Exported', fileAt: p => `Stored at: ${p}`, examples: 'Examples',
    zoomIn: 'Zoom in (Ctrl +)', zoomOut: 'Zoom out (Ctrl −)', zoomReset: 'Click to toggle / reset (Ctrl 0)',
    fitShort: 'Fit', widthShort: 'Width',
    undone: 'Undone (redo: Ctrl+Shift+Z)', redone: 'Redone', nothingToUndo: 'Nothing to undo', nothingToRedo: 'Nothing to redo', page: 'p.', highlightCount: n => `${n} item${n === 1 ? '' : 's'}`,
  },
}

let current = 'ja'

export const setLang = lang => {
  current = STRINGS[lang] ? lang : 'en'
  document.documentElement.lang = current
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n))
  document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = t(el.dataset.i18nTitle))
  document.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh))
}

export const t = (key, ...args) => {
  const v = STRINGS[current][key] ?? STRINGS.en[key] ?? key
  return typeof v === 'function' ? v(...args) : v
}

export const defaultLang = () => (navigator.language || 'en').startsWith('ja') ? 'ja' : 'en'
