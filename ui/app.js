import { makeBook } from './foliate-js/view.js'
import { Overlayer } from './foliate-js/overlayer.js'
import { createTOCView } from './foliate-js/ui/tree.js'
import { t, setLang, defaultLang } from './i18n.js'
import * as WB from './wordbook.js'
import { makeTextBook, kindOf, NO_SCRIPT_META } from './textbook.js'
import { makeSheetBook } from './sheets.js'

const T = window.__TAURI__
const invoke = T.core.invoke
const win = T.window.getCurrentWindow()
const $ = s => document.querySelector(s)
const $$ = s => document.querySelectorAll(s)
const body = document.body

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
  del(k) { try { localStorage.removeItem(k) } catch {} },
}

const DEFAULTS = {
  lang: defaultLang(),
  theme: 'light', font: 'book', fontSize: 18, spacing: 1.7, width: 720,
  flow: 'paginated', columns: 2, justify: true, zoom: 'fit-page', spread: 'single', animated: true,
  textVertical: 'auto', textMode: 'auto',
}
const settings = { ...DEFAULTS, ...store.get('settings', {}) }

const THEMES = {
  light: { bg: '#fbfbf9', fg: '#1f1f1f', link: '#2a6bb5' },
  sepia: { bg: '#f4ecd8', fg: '#5b4636', link: '#8a4b2a' },
  dark:  { bg: '#1d1d1f', fg: '#d9d9d6', link: '#8ab4f8' },
}
// Latin fonts first so English text gets a proper Latin face; CJK falls back per glyph.
const FONTS = {
  serif: `"Literata","Source Serif 4","Noto Serif","Georgia","DejaVu Serif","Noto Serif CJK JP","Noto Serif JP","Source Han Serif JP","IPAexMincho",serif`,
  sans: `"Inter","Noto Sans","Source Sans 3","DejaVu Sans","Noto Sans CJK JP","Noto Sans JP","Source Han Sans JP","IPAexGothic",sans-serif`,
}
const COLORS = { yellow: '#ffd400', green: '#5fd068', blue: '#5aa9ff', pink: '#ff6fb0' }

// syntax colours (GitHub-like), per theme
const HL = {
  light: { kw: '#cf222e', str: '#0a3069', com: '#6e7781', num: '#0550ae', fn: '#8250df', type: '#953800', attr: '#0550ae', meta: '#6639ba', re: '#116329', add: '#116329', del: '#82071e' },
  sepia: { kw: '#a3322a', str: '#2f5a1f', com: '#8f7d68', num: '#1d5a8c', fn: '#7a3f9a', type: '#8a4b0f', attr: '#1d5a8c', meta: '#6b4a9c', re: '#2f6b2f', add: '#2f6b2f', del: '#8a1f1f' },
  dark:  { kw: '#ff7b72', str: '#a5d6ff', com: '#8b949e', num: '#79c0ff', fn: '#d2a8ff', type: '#ffa657', attr: '#79c0ff', meta: '#d2a8ff', re: '#7ee787', add: '#aff5b4', del: '#ffdcd7' },
}
const hljsCSS = theme => {
  const c = HL[theme] ?? HL.light
  return `
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-doctag, .hljs-template-tag, .hljs-type.hljs-keyword { color: ${c.kw} !important; }
.hljs-string, .hljs-template-variable, .hljs-selector-attr, .hljs-char { color: ${c.str} !important; }
.hljs-comment, .hljs-quote { color: ${c.com} !important; font-style: italic; }
.hljs-number, .hljs-symbol, .hljs-bullet, .hljs-variable.constant_ { color: ${c.num} !important; }
.hljs-title, .hljs-title.function_, .hljs-section { color: ${c.fn} !important; }
.hljs-type, .hljs-built_in, .hljs-title.class_, .hljs-variable, .hljs-params { color: ${c.type} !important; }
.hljs-attr, .hljs-attribute, .hljs-property, .hljs-name, .hljs-selector-id, .hljs-selector-class { color: ${c.attr} !important; }
.hljs-meta, .hljs-meta .hljs-keyword { color: ${c.meta} !important; }
.hljs-regexp, .hljs-link { color: ${c.re} !important; }
.hljs-addition { color: ${c.add} !important; background: ${c.add}22 !important; }
.hljs-deletion { color: ${c.del} !important; background: ${c.del}22 !important; }
.hljs-emphasis { font-style: italic; } .hljs-strong { font-weight: bold; }`
}

const bookCSS = s => {
  const th = THEMES[s.theme]
  const font = FONTS[s.font]
  const forceColor = s.theme !== 'light'
  return `
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: ${s.theme === 'dark' ? 'dark' : 'light'};
  font-size: ${s.fontSize}px !important;
  color: ${th.fg} !important;
  background: ${th.bg} !important;
}
body { background: none !important; ${forceColor ? 'color: inherit !important;' : ''} }
${forceColor ? `:is(p, div, span, li, dd, dt, blockquote, td, th, h1, h2, h3, h4, h5, h6, ruby, rt, em, strong, i, b):not(.code *, pre *, .sheet *) { color: inherit !important; background-color: transparent !important; }` : ''}
${font ? `html, body, p, div, span, li, h1, h2, h3, h4, h5, h6, blockquote { font-family: ${font} !important; }` : ''}
.code, .code *, pre, pre *, code, kbd, samp { font-family: "JetBrains Mono","Source Code Pro","Noto Sans Mono","DejaVu Sans Mono","Noto Sans Mono CJK JP",monospace !important; }
${hljsCSS(s.theme)}
a:link, a:visited { color: ${th.link} !important; }
p, li, blockquote, dd {
  line-height: ${s.spacing} !important;
  text-align: ${s.justify ? 'justify' : 'start'};
  -webkit-hyphens: auto; hyphens: auto;
  hanging-punctuation: allow-end last;
  widows: 2; orphans: 2;
}
[align="left"] { text-align: left; } [align="right"] { text-align: right; }
[align="center"] { text-align: center; } [align="justify"] { text-align: justify; }
pre { white-space: pre-wrap !important; }
::selection { background: ${s.theme === 'dark' ? '#e07a5f66' : '#c4483a33'}; }
aside[epub|type~="endnote"], aside[epub|type~="footnote"],
aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
`
}

// ---------- state ----------
let view = null, book = null, bookKey = null, currentFile = null
let isFixed = false, isPDF = false
let tocView = null, saveTimer = null, last = null
let notes = []                    // highlights / notes of the open book
const docIndex = new WeakMap()    // section document -> section index
const wordAnns = new Map()        // CFI -> underline annotation for word-book words

// ---------- helpers ----------
const lang = x => !x ? '' : typeof x === 'string' ? x : x[Object.keys(x)[0]] ?? ''
const contributor = c => Array.isArray(c)
  ? c.map(x => typeof x === 'string' ? x : lang(x?.name)).join(', ')
  : typeof c === 'string' ? c : lang(c?.name)
const basename = p => p.split('/').pop()
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

let toastTimer
const toast = msg => {
  const el = $('#toast'); el.textContent = msg; el.hidden = false
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 3000)
}
const loading = on => $('#loading').hidden = !on

async function copyText(text) {
  try { await navigator.clipboard.writeText(text) }
  catch {
    const ta = document.createElement('textarea'); ta.value = text
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove()
  }
  toast(t('copied'))
}

// convert a rect inside a book frame to main-window coordinates
function frameToHost(win_, rect) {
  const fr = win_.frameElement.getBoundingClientRect()
  const s = fr.width / win_.innerWidth || 1
  return {
    left: fr.left + rect.left * s, right: fr.left + rect.right * s,
    top: fr.top + rect.top * s, bottom: fr.top + rect.bottom * s,
  }
}

// ---------- debug timing (OMNIREADER_DEBUG=1 omnireader) ----------
let DEBUG = false
invoke('debug_enabled').then(v => DEBUG = v).catch(() => {})
const dlog = msg => { if (DEBUG) invoke('debug_log', { msg }).catch(() => {}) }

globalThis.__omnireaderPdfRendered = (page, ms, cached) => dlog(`pdf page ${page} painted in ${ms}ms${cached ? ' (cache)' : ''}`)

// ---------- big files: read on demand instead of loading everything ----------
const LAZY_THRESHOLD = 24 * 1024 * 1024
class LazySlice {
  constructor(path, start, end) { this.path = path; this.start = start; this.size = Math.max(0, end - start) }
  slice(a = 0, b = this.size) {
    const n = this.size
    const norm = x => x < 0 ? Math.max(n + x, 0) : Math.min(x, n)
    const s = norm(a), e = Math.max(s, norm(b))
    return new LazySlice(this.path, this.start + s, this.start + e)
  }
  async arrayBuffer() {
    if (!this.size) return new ArrayBuffer(0)
    return invoke('read_range', { path: this.path, start: this.start, len: this.size })
  }
  async text() { return new TextDecoder().decode(await this.arrayBuffer()) }
}
class LazyFile extends LazySlice {
  constructor(path, size, name) { super(path, 0, size); this.name = name; this.type = ''; this.lastModified = 0 }
}

// ---------- library ----------
const recents = () => store.get('recents', [])
const setRecents = r => store.set('recents', r.slice(0, 60))

function renderLibrary() {
  const list = recents()
  $('#empty').hidden = list.length > 0
  $('#recent').replaceChildren(...list.map(item => {
    const card = document.createElement('div')
    card.className = 'card'
    card.title = item.key
    const cover = store.get('cover:' + item.key)
    const cv = document.createElement('div'); cv.className = 'cv'
    if (cover) { const img = new Image(); img.src = cover; cv.append(img) }
    else { const s = document.createElement('span'); s.textContent = item.title; cv.append(s) }
    const ti = document.createElement('div'); ti.className = 't'; ti.textContent = item.title
    const a = document.createElement('div'); a.className = 'a'; a.textContent = item.author || basename(item.key)
    const pg = document.createElement('div'); pg.className = 'pg'
    const bar = document.createElement('i'); bar.style.width = `${Math.round((item.fraction ?? 0) * 100)}%`
    pg.append(bar)
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×'; rm.title = t('removeFromList')
    rm.onclick = e => { e.stopPropagation(); forget(item.key) }
    card.append(cv, ti, a, pg, rm)
    card.onclick = () => openPath(item.key)
    return card
  }))
}

// removes from the list only; highlights/notes are kept in case the book is opened again
function forget(key) {
  setRecents(recents().filter(r => r.key !== key))
  store.del('cover:' + key)
  renderLibrary()
}

function touchRecent(patch) {
  const list = recents()
  const i = list.findIndex(r => r.key === bookKey)
  const prev = i >= 0 ? list.splice(i, 1)[0] : {}
  list.unshift({ ...prev, ...patch, key: bookKey, t: Date.now() })
  setRecents(list)
}

async function saveCover(key) {
  if (store.get('cover:' + key)) return
  try {
    const blob = await book.getCover?.()
    if (!blob) return
    const bmp = await createImageBitmap(blob)
    const w = 240, h = Math.round(bmp.height * w / bmp.width)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(bmp, 0, 0, w, h)
    store.set('cover:' + key, c.toDataURL('image/jpeg', 0.82))
  } catch {}
}

// ---------- open / close ----------
async function pickAndOpen() {
  const path = await invoke('pick_file')
  if (path) openPath(path)
}

async function openPath(path) {
  loading(true)
  const t0 = performance.now()
  try {
    const size = await invoke('file_size', { path })
    const name = basename(path)
    const file = size > LAZY_THRESHOLD && !kindOf(name)
      ? new LazyFile(path, size, name)
      : new File([await invoke('read_file', { path })], name)
    dlog(`read ${name} (${(size / 1048576).toFixed(1)}MB, ${file instanceof LazyFile ? 'lazy' : 'full'}) ${Math.round(performance.now() - t0)}ms`)
    await openFile(file, path)
    dlog(`opened ${name} ${Math.round(performance.now() - t0)}ms`)
  } catch (e) {
    console.error(e)
    loading(false)
    toast(`${t('openFailed')}: ${e?.message ?? e}`)
    if (String(e).includes('No such file')) forget(path)
  }
}

function closeBook() {
  clearTimeout(saveTimer)
  hideSelBar(); closeEditor()
  if (view) { try { view.close() } catch {} view.remove() }
  view = book = tocView = null
  notes = []
  body.classList.remove('fixed', 'immersive', 'dark-fixed', 'sepia-fixed')
}

async function openFile(file, key) {
  closeBook()
  bookKey = key
  currentFile = file
  const textKind = kindOf(file.name)
  const b = textKind === 'sheet' ? await makeSheetBook(file)
    : textKind
    ? await makeTextBook(file, {
        dir: key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '',
        vertical: settings.textVertical,
        textMode: settings.textMode,
        readFile: path => invoke('read_file', { path }),
      })
    : await makeBook(file)
  body.classList.toggle('textbook', !!textKind && textKind !== 'sheet')
  body.classList.toggle('plaintext', textKind === 'txt' || textKind === 'code')
  isFixed = b.rendition?.layout === 'pre-paginated'
  isPDF = /\.pdf$/i.test(file.name)
  if (isFixed && settings.spread === 'single') b.rendition = { ...b.rendition, spread: 'none' }
  body.classList.toggle('fixed', isFixed)

  notes = store.get('notes:' + key, [])
  wordAnns.clear()
  undoStack.length = redoStack.length = 0

  view = document.createElement('foliate-view')
  $('#stage').append(view)
  // listeners for annotations must exist before the first section loads
  view.addEventListener('load', onLoad)
  view.addEventListener('relocate', onRelocate)
  view.addEventListener('create-overlay', ({ detail: { index } }) => {
    for (const n of notes) if (n.kind === 'cfi' && n.index === index) view.addAnnotation(n)
    scheduleMark(index)
  })
  view.addEventListener('draw-annotation', ({ detail: { draw, annotation, doc } }) => {
    if (annotation.kind === 'word') {
      const writingMode = doc ? doc.defaultView.getComputedStyle(doc.body).writingMode : ''
      draw(dottedUnderline, { color: getComputedStyle(body).getPropertyValue('--accent').trim() || '#c4483a', writingMode })
    } else draw(Overlayer.highlight, { color: COLORS[annotation.color] ?? COLORS.yellow })
  })
  view.addEventListener('show-annotation', ({ detail: { value, range } }) => {
    annotationClickAt = Date.now()
    const n = notes.find(n => n.value === value)
    if (n) return openEditor(n)
    const w = wordAnns.get(value)
    const entry = w && WB.getWord(w.entryId)
    if (entry) openLookup({ word: entry.word, entry, context: range ? { text: WB.sentenceAround(range), book: bookTitle() } : null })
  })
  await view.open(b)
  book = view.book
  book.transformTarget?.addEventListener('data', ({ detail }) => {
    const type = String(detail.type ?? '')
    detail.data = Promise.resolve(detail.data).then(data => {
      if (typeof data !== 'string') return data
      if (/html/.test(type)) {
        // Content-Security-Policy inside each page: book content can't run scripts
        const meta = /xml/.test(type) ? NO_SCRIPT_META.replace(/>$/, '/>') : NO_SCRIPT_META
        return /<head\b[^>]*>/i.test(data)
          ? data.replace(/<head\b[^>]*>/i, m => m + meta)
          : data.replace(/<html\b[^>]*>/i, m => `${m}<head>${meta}</head>`)
      }
      if (/svg/.test(type)) return data.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
      return data
    }).catch(() => '')
  })
  applySettings()

  let title = lang(book.metadata?.title)
  if (!title || /^untitled$/i.test(title.trim())) title = basename(key).replace(/\.[^.]+$/, '')
  const author = contributor(book.metadata?.author)
  $('#book-title').textContent = title
  $('#info-title').textContent = title
  $('#info-author').textContent = author
  document.title = `${title} — OmniReader`
  win.setTitle(document.title).catch(() => {})
  const cover = $('#cover'); cover.removeAttribute('src')
  Promise.resolve(book.getCover?.()).then(bl => bl && (cover.src = URL.createObjectURL(bl))).catch(() => {})

  if (book.toc?.length) {
    tocView = createTOCView(book.toc, href => { view.goTo(href).catch(console.error); closePanels() })
    $('#toc').replaceChildren(tocView.element)
  } else {
    const p = document.createElement('p'); p.className = 'muted'; p.style.padding = '16px'
    p.textContent = t('noToc'); $('#toc').replaceChildren(p)
  }
  renderNotes()

  const pos = store.get('pos:' + key)
  $('#library').hidden = true
  $('#reader').hidden = false
  try { await view.init({ lastLocation: pos?.cfi, showTextStart: !pos }) }
  catch { await view.init({ showTextStart: true }) }

  touchRecent({ title, author })
  saveCover(key)
  loading(false)
}

async function reopen() {
  savePosition()
  loading(true)
  try { await openFile(currentFile, bookKey) } catch (e) { toast(String(e)); loading(false) }
}

function backToLibrary() {
  savePosition()
  closeBook()
  document.title = 'OmniReader'
  win.setTitle('OmniReader').catch(() => {})
  win.setFullscreen(false).catch(() => {})
  $('#reader').hidden = true
  $('#library').hidden = false
  closePanels()
  renderLibrary()
}

// ---------- reading position ----------
let navT0 = 0
function onRelocate({ detail }) {
  if (navT0) { dlog(`page ${detail.section?.current ?? ''} relocate ${Math.round(performance.now() - navT0)}ms`); navT0 = 0 }
  last = detail
  hideSelBar()
  const { fraction = 0, section, location, tocItem } = detail
  $('#progress').value = fraction
  $('#loc-label').textContent = tocItem?.label ?? ''
  $('#loc-percent').textContent = isFixed && section
    ? `${section.current + 1} / ${section.total}`
    : `${Math.round(fraction * 100)}%` + (location?.total ? `  ·  ${location.current + 1}/${location.total}` : '')
  if (tocItem?.href) tocView?.setCurrentHref?.(tocItem.href)
  if (isPDF) setTimeout(redrawPdfAll, 50)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(savePosition, 600)
}

function savePosition() {
  if (!bookKey || !last) return
  store.set('pos:' + bookKey, { cfi: last.cfi, fraction: last.fraction })
  touchRecent({ fraction: last.fraction })
}

// tables read best scrolled; everything else follows the setting
const flowOf = () => view?.book?.isSheet ? 'scrolled' : settings.flow

// ---------- input inside book frames ----------
let annotationClickAt = 0

function onLoad({ detail: { doc, index } }) {
  docIndex.set(doc, index)
  doc.addEventListener('keydown', onKey)
  doc.addEventListener('wheel', onWheel, { passive: false })
  doc.addEventListener('pointerup', e => setTimeout(() => checkSelection(doc, e), 10))
  doc.addEventListener('selectionchange', () => {
    if (doc.getSelection()?.isCollapsed) hideSelBar()
  })
  doc.addEventListener('click', e => {
    if (e.button !== 0 || e.defaultPrevented) return
    if (e.target.closest?.('a[href]')) return
    const sel = e.view.getSelection()
    if (sel && !sel.isCollapsed) return
    if (isPDF) {
      const hit = pdfHitTest(doc, e)
      if (hit) return openEditor(hit)
    }
    const win_ = e.view, cx = e.clientX
    // let foliate's overlayer hit-test run first (it fires show-annotation)
    setTimeout(() => {
      if (Date.now() - annotationClickAt < 200) return
      try {
        const r = win_.frameElement.getBoundingClientRect()
        zoneClick(r.left + cx * (r.width / win_.innerWidth))
      } catch { toggleImmersive() }
    }, 0)
  })
  if (isPDF) {
    setTimeout(() => drawPdfPage(doc), 0)
    fixPdfSelection(doc)
  }
}

// WebKit selects to the end of the page when the pointer is between text spans.
// Same workaround as PDF.js' own viewer: keep .endOfContent right after the selection focus.
function fixPdfSelection(doc) {
  let prev = null
  doc.addEventListener('selectionchange', () => {
    const layer = doc.querySelector('.textLayer')
    const end = layer?.querySelector('.endOfContent')
    if (!end) return
    const sel = doc.getSelection()
    if (!sel?.rangeCount || sel.isCollapsed) {
      end.style.width = end.style.height = end.style.userSelect = ''
      layer.append(end)
      prev = null
      return
    }
    const range = sel.getRangeAt(0)
    const modifyStart = prev && (range.compareBoundaryPoints(2, prev) === 0 || range.compareBoundaryPoints(1, prev) === 0)
    let anchor = modifyStart ? range.startContainer : range.endContainer
    if (anchor.nodeType === 3) anchor = anchor.parentNode
    if (!modifyStart && range.endOffset === 0 && anchor !== layer) {
      do {
        while (!anchor.previousSibling && anchor.parentNode !== layer) anchor = anchor.parentNode
        anchor = anchor.previousSibling ?? anchor
      } while (anchor && !anchor.childNodes?.length && anchor.previousSibling)
    }
    if (anchor && anchor !== layer && anchor !== end && layer.contains(anchor) && anchor.parentElement) {
      end.style.width = layer.style.width
      end.style.height = layer.style.height
      end.style.userSelect = 'text'
      anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling)
    }
    prev = range.cloneRange()
  })
}

function zoneClick(x) {
  if ($('#editor').classList.contains('show')) return
  if (!$('#sel-bar').hidden) return hideSelBar()
  const w = window.innerWidth
  const paging = isFixed || flowOf() === 'paginated'
  if (paging && x < w * 0.28) (navT0 = performance.now(), view?.goLeft())
  else if (paging && x > w * 0.72) (navT0 = performance.now(), view?.goRight())
  else toggleImmersive()
}

let wheelAt = 0
let zoomWheelAt = 0
function onWheel(e) {
  if (!view) return
  if (e.ctrlKey) {
    e.preventDefault()
    const now = Date.now()
    if (now - zoomWheelAt < 120 || Math.abs(e.deltaY) < 1) return
    zoomWheelAt = now
    return zoom(e.deltaY < 0 ? 1 : -1)
  }
  const hijack = isFixed ? settings.zoom === 'fit-page' : flowOf() === 'paginated'
  if (!hijack) return
  e.preventDefault()
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  const now = Date.now()
  if (Math.abs(d) < 3 || now - wheelAt < 280) return
  wheelAt = now
  d > 0 ? view.next() : view.prev()
}

const toggleImmersive = force => body.classList.toggle('immersive', force)

// ---------- selection toolbar ----------
let pending = null   // { doc, index, range, text }

function checkSelection(doc) {
  const sel = doc.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  const text = sel.toString().trim()
  if (!text) return
  const index = docIndex.get(doc)
  if (index == null) return
  pending = { doc, index, range: range.cloneRange(), text }
  const known = text.length < 80 ? WB.findWord(text) : null
  const def = $('#sel-def')
  def.hidden = !known
  if (known) {
    const b = document.createElement('b'); b.textContent = known.word
    def.replaceChildren(b, document.createTextNode(known.meaning || '…'))
  }
  const rects = [...range.getClientRects()].filter(r => r.width && r.height)
  if (!rects.length) return
  const first = frameToHost(doc.defaultView, rects[0])
  const lastR = frameToHost(doc.defaultView, rects[rects.length - 1])
  const bar = $('#sel-bar')
  bar.hidden = false
  const bw = bar.offsetWidth, bh = bar.offsetHeight
  let x = (first.left + first.right) / 2
  let y = first.top - bh - 10
  if (y < 8) y = lastR.bottom + 10
  x = Math.min(window.innerWidth - bw / 2 - 8, Math.max(bw / 2 + 8, x))
  y = Math.min(window.innerHeight - bh - 8, y)
  bar.style.left = `${x}px`
  bar.style.top = `${y}px`
}

function hideSelBar() { $('#sel-bar').hidden = true }

function createNote(color) {
  if (!pending || !view) return null
  const { doc, index, range, text } = pending
  const base = {
    id: uid(), color, note: '', text: text.replace(/\s+/g, ' ').slice(0, 2000),
    index, label: last?.tocItem?.label ?? '', created: Date.now(),
  }
  let n
  if (isPDF) {
    const rects = pdfRects(doc, range)
    if (!rects.length) return null
    n = { ...base, kind: 'pdf', rects }
  } else if (!isFixed) {
    n = { ...base, kind: 'cfi', value: view.getCFI(index, range) }
  } else return null           // comics / fixed EPUB: no text layer
  doc.getSelection().removeAllRanges()
  hideSelBar()
  pending = null
  snapshot()
  notes.push(n)
  persistNotes()
  if (n.kind === 'cfi') view.addAnnotation(n)
  else redrawPdfAll()
  return n
}

$('#sel-bar').addEventListener('pointerdown', e => e.preventDefault())
$$('#sel-bar .dot').forEach(b => b.onclick = () => createNote(b.dataset.color))
$('#sel-note').onclick = () => { const n = createNote('yellow'); if (n) openEditor(n, true) }
$('#sel-dict').onclick = () => {
  if (!pending) return
  const { text, range, doc } = pending
  const entry = WB.findWord(text)
  const word = entry?.word ?? text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  doc.getSelection().removeAllRanges()
  hideSelBar()
  openLookup({ word, entry, context: { text: WB.sentenceAround(range), book: bookTitle() } })
}
$('#sel-copy').onclick = () => {
  if (!pending) return
  copyText(pending.text)
  pending.doc.getSelection().removeAllRanges()
  hideSelBar()
}

// ---------- PDF highlights (drawn into the PDF text layer) ----------
function pdfRects(doc, range) {
  const layer = doc.querySelector('.textLayer')
  const L = layer.getBoundingClientRect()
  const raw = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5)
  // merge per line
  const lines = []
  for (const r of raw.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find(l => Math.abs(l.top - r.top) < r.height * 0.5 && Math.abs(l.bottom - r.bottom) < r.height * 0.5)
    if (line && r.left <= line.right + r.height) {
      line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right)
      line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom)
    } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
  }
  const f = v => Math.round(v * 10000) / 10000
  return lines.map(l => [f((l.left - L.left) / L.width), f((l.top - L.top) / L.height),
    f((l.right - l.left) / L.width), f((l.bottom - l.top) / L.height)])
}

function drawPdfPage(doc) {
  const index = docIndex.get(doc)
  const layer = doc?.querySelector?.('.textLayer')
  if (index == null || !layer) return
  layer.querySelector(':scope > .omnireader-hl')?.remove()
  const mine = notes.filter(n => n.kind === 'pdf' && n.index === index)
  if (!mine.length) return
  const box = doc.createElement('div')
  box.className = 'omnireader-hl'
  box.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:-1'
  for (const n of mine) for (const [x, y, w, h] of n.rects) {
    const d = doc.createElement('div')
    d.style.cssText = `position:absolute;left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%;` +
      `background:${COLORS[n.color] ?? COLORS.yellow};opacity:.4;border-radius:2px`
    box.append(d)
  }
  layer.prepend(box)
}

function redrawPdfAll() {
  if (!view?.renderer?.getContents) return
  for (const { doc } of view.renderer.getContents()) if (doc) drawPdfPage(doc)
}

function pdfHitTest(doc, e) {
  const index = docIndex.get(doc)
  const layer = doc.querySelector('.textLayer')
  if (!layer) return null
  const L = layer.getBoundingClientRect()
  const px = (e.clientX - L.left) / L.width, py = (e.clientY - L.top) / L.height
  return notes.find(n => n.kind === 'pdf' && n.index === index &&
    n.rects.some(([x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h)) ?? null
}

// ---------- notes: persistence / list / editor ----------
function persistNotes() {
  store.set('notes:' + bookKey, notes)
  renderNotes()
}

function sortedNotes() {
  return [...notes].sort((a, b) => a.index - b.index ||
    (a.kind === 'pdf' ? a.rects[0][1] - b.rects[0][1] : a.created - b.created))
}

function noteMeta(n) {
  return isFixed ? `${t('page')} ${n.index + 1}` : n.label
}

function renderNotes() {
  const list = sortedNotes()
  $('#notes-count').textContent = list.length ? list.length : ''
  $('#notes-empty').hidden = list.length > 0
  $('#export-btn').hidden = list.length === 0
  $('#notes-list').replaceChildren(...list.map(n => {
    const item = document.createElement('button')
    item.className = 'note-item'
    item.style.setProperty('--c', COLORS[n.color])
    const q = document.createElement('div'); q.className = 'q'; q.textContent = n.text
    item.append(q)
    if (n.note) { const d = document.createElement('div'); d.className = 'n'; d.textContent = n.note; item.append(d) }
    const m = document.createElement('div'); m.className = 'm'; m.textContent = noteMeta(n)
    item.append(m)
    item.onclick = () => { goToNote(n); closePanels() }
    item.ondblclick = () => openEditor(n)
    return item
  }))
}

function goToNote(n) {
  if (n.kind === 'cfi') view.goTo(n.value).catch(console.error)
  else view.goTo(n.index).then(() => setTimeout(redrawPdfAll, 100)).catch(console.error)
}

let editing = null
function openEditor(n, focus = false) {
  editing = n
  hideSelBar()
  closePanels()
  const ed = $('#editor')
  ed.style.setProperty('--c', COLORS[n.color])
  $('#ed-quote').textContent = n.text
  $('#ed-text').value = n.note ?? ''
  $$('#editor .dot').forEach(b => b.classList.toggle('on', b.dataset.color === n.color))
  ed.classList.add('show'); $('#scrim').classList.add('show')
  setTimeout(() => $('#ed-text').focus(), 50)
}

function closeEditor() {
  editing = null
  $('#ed-text').blur()
  $('#editor').classList.remove('show')
  if (!document.querySelector('.panel.show')) $('#scrim').classList.remove('show')
}

function redrawNote(n) {
  if (n.kind === 'cfi') view?.addAnnotation(n)
  else redrawPdfAll()
}

$$('#editor .dot').forEach(b => b.onclick = () => {
  if (!editing || editing.color === b.dataset.color) return
  snapshot()
  editing.color = b.dataset.color
  $$('#editor .dot').forEach(x => x.classList.toggle('on', x === b))
  $('#editor').style.setProperty('--c', COLORS[editing.color])
  persistNotes(); redrawNote(editing)
})
$('#ed-save').onclick = () => {
  if (!editing) return
  const text = $('#ed-text').value.trim()
  if (text !== (editing.note ?? '')) snapshot()
  editing.note = text
  persistNotes()
  closeEditor()
}
$('#ed-cancel').onclick = closeEditor
$('#ed-delete').onclick = () => {
  if (!editing) return
  const n = editing
  snapshot()
  notes = notes.filter(x => x.id !== n.id)
  persistNotes()
  if (n.kind === 'cfi') view?.deleteAnnotation(n)
  else redrawPdfAll()
  closeEditor()
}
$('#ed-text').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#ed-save').click() }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditor() }
})

$('#export-btn').onclick = () => {
  const title = $('#book-title').textContent
  let md = `# ${title}\n`
  let section = null
  for (const n of sortedNotes()) {
    const meta = noteMeta(n)
    if (meta && meta !== section) { md += `\n## ${meta}\n`; section = meta }
    md += `\n> ${n.text.replace(/\n/g, '\n> ')}\n`
    if (n.note) md += `\n${n.note}\n`
  }
  copyText(md)
}

// ---------- keyboard ----------
async function toggleFullscreen() {
  const fs = !(await win.isFullscreen())
  await win.setFullscreen(fs)
  toggleImmersive(fs)
}

function bump(key, dir) {
  const el = document.querySelector(`.step[data-key="${key}"]`)
  const step = +el.dataset.step, min = +el.dataset.min, max = +el.dataset.max
  settings[key] = Math.min(max, Math.max(min, Math.round((settings[key] + dir * step) * 100) / 100))
  applySettings()
}

// actual scale of a fixed-layout page (so zooming starts from what you see, not from 100%)
function currentFixedScale() {
  if (typeof settings.zoom === 'number') return settings.zoom
  try {
    const { doc } = view.renderer.getContents().find(c => c.doc) ?? {}
    const meta = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
    const w = parseFloat(/width\s*=\s*([\d.]+)/.exec(meta)?.[1])
    const fw = doc.defaultView.frameElement.getBoundingClientRect().width
    if (w && fw) return fw / w
  } catch {}
  return 1
}

function zoomFixed(dir) {
  const cur = currentFixedScale()
  settings.zoom = dir === 0 ? 'fit-page'
    : Math.min(6, Math.max(0.25, Math.round(cur * (dir > 0 ? 1.15 : 1 / 1.15) * 100) / 100))
  applySettings()
  if (isPDF) setTimeout(redrawPdfAll, 300)
}

function zoom(dir) {
  if (!view) return
  if (isFixed) return zoomFixed(dir)
  if (dir === 0) { settings.fontSize = DEFAULTS.fontSize; applySettings() }
  else bump('fontSize', dir)
}

function zoomLabel() {
  if (isFixed) {
    const z = settings.zoom
    return typeof z === 'number' ? `${Math.round(z * 100)}%` : z === 'fit-width' ? t('widthShort') : t('fitShort')
  }
  return `${Math.round(settings.fontSize / DEFAULTS.fontSize * 100)}%`
}

// ---------- undo / redo for highlights & notes ----------
const undoStack = [], redoStack = []
function snapshot() {
  undoStack.push(JSON.stringify(notes))
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
}
function restoreNotes(json) {
  const old = notes
  notes = JSON.parse(json)
  store.set('notes:' + bookKey, notes)
  renderNotes()
  if (isPDF) return redrawPdfAll()
  if (isFixed || !view) return
  const keep = new Set(notes.map(n => n.value))
  for (const o of old) if (o.kind === 'cfi' && !keep.has(o.value)) view.deleteAnnotation(o)
  for (const n of notes) if (n.kind === 'cfi') view.addAnnotation(n)
}
function undo() {
  if (!undoStack.length) return toast(t('nothingToUndo'))
  closeEditor(); hideSelBar()
  redoStack.push(JSON.stringify(notes))
  restoreNotes(undoStack.pop())
  toast(t('undone'))
}
function redo() {
  if (!redoStack.length) return toast(t('nothingToRedo'))
  closeEditor(); hideSelBar()
  undoStack.push(JSON.stringify(notes))
  restoreNotes(redoStack.pop())
  toast(t('redone'))
}

function onKey(e) {
  const k = e.key
  const ctrl = e.ctrlKey || e.metaKey
  const tag = e.target?.tagName
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')) return
  if (document.querySelector('.modal.show')) {
    if (k === 'Escape') { e.preventDefault(); closeModals() }
    return
  }
  if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); return pickAndOpen() }
  if (ctrl && k.toLowerCase() === 'a' && e.currentTarget === document) { e.preventDefault(); return }
  if (!ctrl && !e.altKey && (k === 'w' || k === 'W')) { e.preventDefault(); return openWordbook() }
  if (!view) return
  if ($('#editor').classList.contains('show')) {
    if (k === 'Escape') { e.preventDefault(); closeEditor() }
    return
  }

  if (ctrl && (k === '=' || k === '+' || k === ';')) { e.preventDefault(); return zoom(1) }
  if (ctrl && k === '-') { e.preventDefault(); return zoom(-1) }
  if (ctrl && k === '0') { e.preventDefault(); return zoom(0) }
  if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo() }
  if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); return redo() }
  if (ctrl && k.toLowerCase() === 'c' && pending && !$('#sel-bar').hidden) return  // native copy
  if (ctrl || e.altKey) return

  const paged = isFixed || flowOf() === 'paginated'
  switch (k) {
    case 'ArrowLeft': case 'h': e.preventDefault(); (navT0 = performance.now(), view.goLeft()); break
    case 'ArrowRight': case 'l': e.preventDefault(); (navT0 = performance.now(), view.goRight()); break
    case 'ArrowDown': case 'j': if (paged) { e.preventDefault(); view.next() } break
    case 'ArrowUp': case 'k': if (paged) { e.preventDefault(); view.prev() } break
    case ' ': case 'PageDown': e.preventDefault(); e.shiftKey ? view.prev() : view.next(); break
    case 'PageUp': e.preventDefault(); view.prev(); break
    case 'Home': e.preventDefault(); view.goToFraction(0); break
    case 'End': e.preventDefault(); view.goToFraction(1); break
    case 't': case 'T': togglePanel('#toc-panel'); break
    case 'n': case 'N': togglePanel('#toc-panel', 'notes'); break
    case 'f': case 'F': case 'F11': e.preventDefault(); toggleFullscreen(); break
    case 'Backspace': e.preventDefault(); view.history?.back(); break
    case 'Escape':
      e.preventDefault()
      if (!$('#sel-bar').hidden) hideSelBar()
      else if (document.querySelector('.panel.show')) closePanels()
      else if (body.classList.contains('immersive')) { win.setFullscreen(false).catch(() => {}); toggleImmersive(false) }
      else backToLibrary()
      break
  }
}

// ---------- panels ----------
function closePanels() {
  $$('.panel.show').forEach(p => { if (p.id !== 'editor') p.classList.remove('show') })
  if (!$('#editor').classList.contains('show')) $('#scrim').classList.remove('show')
}
function showTab(name) {
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name))
  $('#toc').hidden = name !== 'toc'
  $('#notes').hidden = name !== 'notes'
}
function togglePanel(sel, tab) {
  const p = $(sel)
  const open = !p.classList.contains('show') || (tab && $(`.tabs button[data-tab="${tab}"]`)?.classList.contains('on') === false)
  closePanels()
  if (tab) showTab(tab)
  if (open) {
    p.classList.add('show'); $('#scrim').classList.add('show')
    if (sel === '#toc-panel') $('#toc [aria-current]')?.scrollIntoView({ block: 'center' })
  }
}
$$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab))

// ---------- settings ----------
function applySettings() {
  store.set('settings', settings)
  setLang(settings.lang)
  body.dataset.theme = settings.theme
  body.classList.toggle('dark-fixed', isPDF && settings.theme === 'dark')
  body.classList.toggle('sepia-fixed', isPDF && settings.theme === 'sepia')

  $$('.seg').forEach(seg => {
    const v = String(settings[seg.dataset.key])
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v))
  })
  $$('.step').forEach(st => {
    const key = st.dataset.key, v = settings[key]
    st.querySelector('output').textContent = key === 'spacing' ? v.toFixed(1) : `${v}px`
  })

  $('#zoom-label').textContent = zoomLabel()
  const r = view?.renderer
  if (!r) return
  if (settings.animated) r.setAttribute('animated', '')
  else r.removeAttribute('animated')
  if (isFixed) {
    r.setAttribute('zoom', settings.zoom)
  } else {
    r.setAttribute('flow', flowOf())
    r.setAttribute('gap', '7%')
    r.setAttribute('margin', '28px')
    const code = view.book?.isCode || view.book?.isWide
    r.setAttribute('max-inline-size', `${code ? Math.max(settings.width, 1400) : settings.width}px`)
    r.setAttribute('max-column-count', code ? 1 : settings.columns)
    r.setStyles?.(bookCSS(settings))
  }
}

function initSettingsUI() {
  $$('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return
      const raw = b.dataset.v
      const key = seg.dataset.key
      const val = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) ? +raw : raw
      if (settings[key] === val) return
      settings[key] = val
      applySettings()
      if (key === 'lang') { renderLibrary(); if (view) renderNotes() }
      if (key === 'zoom' && isPDF) setTimeout(redrawPdfAll, 300)
      if (key === 'spread' && view && isFixed) reopen()
      if ((key === 'textVertical' || key === 'textMode') && view && body.classList.contains('textbook')) reopen()
    })
  })
  $$('.step').forEach(st => {
    const minus = document.createElement('button'); minus.textContent = '−'
    const plus = document.createElement('button'); plus.textContent = '+'
    minus.onclick = () => bump(st.dataset.key, -1)
    plus.onclick = () => bump(st.dataset.key, 1)
    st.append(minus, document.createElement('output'), plus)
  })
}

// ---------- wiring ----------
initSettingsUI()
applySettings()
renderLibrary()

$('#open-btn').onclick = pickAndOpen
$('#back-btn').onclick = backToLibrary
$('#toc-btn').onclick = () => togglePanel('#toc-panel')
$('#settings-btn').onclick = () => togglePanel('#settings-panel')
$('#fs-btn').onclick = toggleFullscreen
$('#zoom-in').onclick = () => zoom(1)
$('#zoom-out').onclick = () => zoom(-1)
$('#zoom-label').onclick = () => {
  if (!isFixed) return zoom(0)
  settings.zoom = settings.zoom === 'fit-page' ? 'fit-width' : 'fit-page'
  applySettings()
  if (isPDF) setTimeout(redrawPdfAll, 300)
}
$('#scrim').onclick = () => { closeEditor(); closePanels() }
document.addEventListener('click', e => e.target.closest?.('button')?.blur())
$('#progress').addEventListener('change', e => view?.goToFraction(parseFloat(e.target.value)))
$('#stage').addEventListener('click', e => { if (e.target === $('#stage') || e.target === view) zoneClick(e.clientX) })
$('#stage').addEventListener('wheel', onWheel, { passive: false })
document.addEventListener('keydown', onKey)
window.addEventListener('beforeunload', savePosition)
let resizeTimer
window.addEventListener('resize', () => {
  hideSelBar()
  if (isPDF) { clearTimeout(resizeTimer); resizeTimer = setTimeout(redrawPdfAll, 300) }
})

T.event.listen('tauri://drag-enter', () => body.classList.add('dragging'))
T.event.listen('tauri://drag-leave', () => body.classList.remove('dragging'))
T.event.listen('tauri://drag-drop', ({ payload }) => {
  body.classList.remove('dragging')
  const p = payload?.paths?.[0]
  if (p) openPath(p)
})

// ---------- word book: underlines in text ----------
function dottedUnderline(rects, { color, writingMode }) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  const vertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr'
  for (const r of rects) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    const [x1, y1, x2, y2] = vertical
      ? [r.right - 1, r.top, r.right - 1, r.bottom]
      : [r.left, r.bottom - 1, r.right, r.bottom - 1]
    Object.entries({ x1, y1, x2, y2, stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '2 2.5', 'stroke-linecap': 'round', opacity: 0.85 })
      .forEach(([k, v]) => l.setAttribute(k, v))
    g.append(l)
  }
  return g
}

const bookTitle = () => $('#book-title').textContent

// Runs after the page is on screen, in small chunks, so it never delays page display.
const markTimers = new Map()
function scheduleMark(index, delay = 300) {
  clearTimeout(markTimers.get(index))
  markTimers.set(index, setTimeout(() => { markTimers.delete(index); markWords(index) }, delay))
}
const markGen = new Map()
async function markWords(index) {
  if (!view || isFixed || view.book?.isCode || view.book?.isSheet) return
  const gen = (markGen.get(index) ?? 0) + 1
  markGen.set(index, gen)
  for (const [cfi, a] of wordAnns) if (a.index === index) { view.deleteAnnotation(a); wordAnns.delete(cfi) }
  const c = view.renderer.getContents().find(x => x.index === index)
  if (!c?.doc || !WB.wordCount()) return
  const t0 = performance.now()
  const matches = WB.findMatches(c.doc)
  const noteValues = new Set(notes.map(n => n.value))
  for (let i = 0; i < matches.length; i++) {
    if (i && i % 25 === 0) {
      await new Promise(r => setTimeout(r, 0))   // yield to input / rendering
      if (gen !== markGen.get(index) || !view?.renderer.getContents().some(x => x.doc === c.doc)) return
    }
    const { node, start, end, entry } = matches[i]
    try {
      const r = c.doc.createRange(); r.setStart(node, start); r.setEnd(node, end)
      const value = view.getCFI(index, r)
      if (wordAnns.has(value) || noteValues.has(value)) continue
      const a = { value, kind: 'word', entryId: entry.id, index }
      wordAnns.set(value, a)
      view.addAnnotation(a)
    } catch (e) { console.warn(e) }
  }
  dlog(`marked ${matches.length} words in section ${index} ${Math.round(performance.now() - t0)}ms`)
}
function remarkAll() {
  if (!view || isFixed) return
  for (const c of view.renderer.getContents()) if (c.index != null) scheduleMark(c.index, 0)
}

// ---------- word book: lookup editor ----------
let lookupState = null   // { entry, context }
let refSeq = 0

function closeModals() {
  $$('.modal.show').forEach(m => m.classList.remove('show'))
  $('#modal-scrim').classList.remove('show')
  lookupState = null
  document.activeElement?.blur?.()
}
function showModal(id) {
  $$('.modal.show').forEach(m => m.classList.remove('show'))
  $(id).classList.add('show')
  $('#modal-scrim').classList.add('show')
}

function openLookup({ word, entry = null, context = null }) {
  hideSelBar(); closeEditor(); closePanels()
  lookupState = { entry, context }
  $('#lk-word').value = entry?.word ?? word
  $('#lk-meaning').value = entry?.meaning ?? ''
  $('#lk-delete').hidden = !entry
  const ctxText = context?.text
  const isNewEx = ctxText && !(entry?.examples ?? []).some(x => x.text === ctxText)
  $('#lk-ex-row').hidden = !isNewEx
  if (isNewEx) {
    $('#lk-ex-text').textContent = `“${ctxText}”`
    $('#lk-ex-book').textContent = context.book ? `— ${context.book}` : ''
    $('#lk-ex-on').checked = true
  }
  renderExamples(entry)
  showModal('#lookup')
  setTimeout(() => $('#lk-meaning').focus(), 60)
  loadReference($('#lk-word').value)
}

function renderExamples(entry) {
  $('#lk-examples').replaceChildren(...(entry?.examples ?? []).map(ex => {
    const d = document.createElement('div'); d.className = 'ex'
    d.append(`“${ex.text}” `)
    if (ex.book) { const m = document.createElement('span'); m.className = 'muted'; m.textContent = `— ${ex.book}`; d.append(m) }
    const x = document.createElement('button'); x.textContent = '×'
    x.onclick = () => { WB.removeExample(entry.id, ex.text); renderExamples(WB.getWord(entry.id)) }
    d.append(x)
    return d
  }))
}

async function loadReference(word) {
  const seq = ++refSeq
  const status = $('#lk-ref-status'), list = $('#lk-senses')
  list.replaceChildren(); $('#lk-lemma').hidden = true
  status.textContent = t('loadingRef')
  try {
    const { senses, lemma } = await WB.wiktionary(word)
    if (seq !== refSeq) return
    status.textContent = senses.length ? '' : t('refNone')
    for (const s of senses) {
      const pos = document.createElement('div'); pos.className = 'pos'; pos.textContent = s.pos
      list.append(pos)
      for (const d of s.defs) {
        const b = document.createElement('button'); b.className = 'def'; b.textContent = d; b.title = t('clickToAppend')
        b.onclick = () => {
          const ta = $('#lk-meaning')
          ta.value = ta.value.trim() ? `${ta.value.trim()}\n${d}` : d
          ta.focus()
        }
        list.append(b)
      }
    }
    if (lemma) {
      const chip = $('#lk-lemma'); chip.hidden = false; chip.textContent = `→ ${lemma}`
      chip.onclick = () => {
        $('#lk-word').value = lemma
        const ex = WB.findWord(lemma)
        if (ex && !lookupState.entry) { lookupState.entry = ex; $('#lk-meaning').value = ex.meaning; $('#lk-delete').hidden = false; renderExamples(ex) }
        loadReference(lemma)
      }
    }
  } catch (e) {
    if (seq === refSeq) status.textContent = t('refFailed')
  }
}

const EXT = {
  wiktionary: w => `https://en.wiktionary.org/wiki/${encodeURIComponent(w.replace(/ /g, '_'))}`,
  eijiro: w => `https://eow.alc.co.jp/search?q=${encodeURIComponent(w)}`,
  google: w => `https://www.google.com/search?q=${encodeURIComponent('define ' + w)}`,
}
$$('#lookup .ext').forEach(b => b.onclick = () =>
  invoke('open_url', { url: EXT[b.dataset.site]($('#lk-word').value.trim()) }).catch(e => toast(String(e))))

let wordInputTimer
$('#lk-word').addEventListener('input', () => {
  clearTimeout(wordInputTimer)
  wordInputTimer = setTimeout(() => loadReference($('#lk-word').value), 600)
})

$('#lk-save').onclick = () => {
  if (!lookupState) return
  const { entry, context } = lookupState
  const word = $('#lk-word').value.trim()
  if (!word) return $('#lk-word').focus()
  const example = context?.text && $('#lk-ex-on').checked && !$('#lk-ex-row').hidden ? context : null
  WB.saveWord({ id: entry?.id, word, meaning: $('#lk-meaning').value, example })
  closeModals()
  toast(t('saved'))
  remarkAll()
  if ($('#wordbook').dataset.reopen) { delete $('#wordbook').dataset.reopen; openWordbook() }
}
$('#lk-delete').onclick = () => {
  const e = lookupState?.entry; if (!e) return
  WB.deleteWord(e.id)
  closeModals()
  remarkAll()
  if ($('#wordbook').dataset.reopen) { delete $('#wordbook').dataset.reopen; openWordbook() }
}
$('#lk-cancel').onclick = () => {
  closeModals()
  if ($('#wordbook').dataset.reopen) { delete $('#wordbook').dataset.reopen; openWordbook() }
}
$('#lookup').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#lk-save').click() }
  else if (e.key === 'Enter' && e.target.id === 'lk-word') { e.preventDefault(); $('#lk-meaning').focus() }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); $('#lk-cancel').click() }
})

// ---------- word book: manager ----------
function openWordbook() {
  hideSelBar(); closePanels()
  showModal('#wordbook')
  $('#wb-search').value = ''
  renderWordbook()
  invoke('wordbook_path').then(p => $('#wb-path').textContent = t('fileAt', p)).catch(() => {})
  setTimeout(() => $('#wb-search').focus(), 60)
}
function renderWordbook() {
  const q = $('#wb-search').value.trim().toLowerCase()
  const all = WB.allWords()
  const list = q ? all.filter(e => e.word.toLowerCase().includes(q) || (e.meaning ?? '').toLowerCase().includes(q)) : all
  $('#wb-count').textContent = String(all.length)
  $('#wb-empty').hidden = all.length > 0
  $('#wb-list').replaceChildren(...list.map(e => {
    const b = document.createElement('button'); b.className = 'wb-item'
    const w = document.createElement('div'); w.className = 'w'; w.textContent = e.word
    const m = document.createElement('div'); m.className = 'm' + (e.meaning ? '' : ' empty')
    m.textContent = e.meaning || (e.examples[0] ? `“${e.examples[0].text}”` : '—')
    b.append(w, m)
    b.onclick = () => { $('#wordbook').dataset.reopen = '1'; openLookup({ word: e.word, entry: e }) }
    return b
  }))
}
$('#wb-search').addEventListener('input', renderWordbook)
$('#wb-search').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModals() } })
$('#wb-close').onclick = closeModals
$('#modal-scrim').onclick = () => { delete $('#wordbook').dataset.reopen; closeModals() }
$('#wordbook-btn').onclick = openWordbook
$('#wordbook-btn2').onclick = openWordbook
$('#wb-export').onclick = async () => {
  try {
    const p = await invoke('export_text', { name: 'omnireader-wordbook.tsv', content: WB.toTSV() })
    if (p) toast(t('exported'))
  } catch (e) { toast(String(e)) }
}
$('#wb-import').onclick = async () => {
  try {
    const text = await invoke('import_text')
    if (text == null) return
    const n = WB.importText(text)
    renderWordbook(); remarkAll()
    toast(t('imported', n))
  } catch (e) { toast(String(e)) }
}

await WB.loadWords()
invoke('initial_path').then(p => p && openPath(p))
