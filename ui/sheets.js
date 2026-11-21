// CSV / TSV / XLSX / ODS -> foliate-js book object (built-in table viewer, no external software)
import { decodeText, NO_SCRIPT_META } from './textbook.js'

export const SHEET_EXTS = ['csv', 'tsv', 'tab', 'xlsx', 'xlsm', 'ods']

const ROWS_PER_PAGE = 300
const MAX_ROWS = 50000
const MAX_COLS = 300

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const byTag = (el, name) => [...el.getElementsByTagNameNS('*', name)]
const childrenByTag = (el, name) => [...el.children].filter(c => c.localName === name)

// ---------- CSV ----------
function detectDelimiter(text, ext) {
  if (ext === 'tsv' || ext === 'tab') return '\t'
  const sample = text.split('\n').slice(0, 10).join('\n').replace(/"[^"]*"/g, '')
  const counts = [',', '\t', ';', '|'].map(d => [d, sample.split(d).length - 1])
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

export function parseCSV(text, delim) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
      if (rows.length >= MAX_ROWS) break
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// ---------- XLSX ----------
const colIndex = ref => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])
const pad = n => String(n).padStart(2, '0')
function excelDate(serial, hasDate, hasTime) {
  const ms = Math.round((serial - 25569) * 86400000)   // 25569 = days from 1899-12-30 to 1970-01-01
  const d = new Date(ms)
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` + (d.getUTCSeconds() ? `:${pad(d.getUTCSeconds())}` : '')
  if (hasDate && hasTime) return `${date} ${time}`
  return hasTime && !hasDate ? time : date
}
const formatNumber = v => {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(12)))
}

async function readXLSX(buf) {
  const { configure, ZipReader, BlobReader, TextWriter } = await import('./foliate-js/vendor/zip.js')
  configure({ useWebWorkers: false })
  const zip = new ZipReader(new BlobReader(new Blob([buf])))
  const entries = new Map((await zip.getEntries()).map(e => [e.filename, e]))
  const parser = new DOMParser()
  const xml = async name => {
    const e = entries.get(name)
    return e ? parser.parseFromString(await e.getData(new TextWriter()), 'application/xml') : null
  }

  // shared strings (skip <rPh> phonetic runs: Japanese furigana)
  const shared = []
  const sst = await xml('xl/sharedStrings.xml')
  if (sst) for (const si of byTag(sst, 'si')) {
    shared.push(byTag(si, 't').filter(t => !t.closest('rPh') && t.parentElement?.localName !== 'rPh')
      .map(t => t.textContent).join(''))
  }

  // number formats -> which style indexes are dates / times
  const styleKind = []
  const styles = await xml('xl/styles.xml')
  if (styles) {
    const custom = new Map(byTag(styles, 'numFmt').map(f => [+f.getAttribute('numFmtId'), f.getAttribute('formatCode') ?? '']))
    const cellXfs = byTag(styles, 'cellXfs')[0]
    for (const xf of cellXfs ? childrenByTag(cellXfs, 'xf') : []) {
      const id = +xf.getAttribute('numFmtId')
      let date = false, time = false
      if (BUILTIN_DATE.has(id)) { date = ![18, 19, 20, 21, 45, 46, 47].includes(id); time = [18, 19, 20, 21, 22, 45, 46, 47].includes(id) }
      else if (custom.has(id)) {
        const code = custom.get(id).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
        date = /[dy]/i.test(code) || /m{3,}/i.test(code)
        time = /[hs]/i.test(code)
      }
      styleKind.push(date || time ? { date, time } : null)
    }
  }

  // workbook: sheet order and names
  const wb = await xml('xl/workbook.xml')
  const rels = await xml('xl/_rels/workbook.xml.rels')
  const relMap = new Map(rels ? byTag(rels, 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]) : [])
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const sheets = []
  for (const s of wb ? byTag(wb, 'sheet') : []) {
    if (s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden') continue
    const rid = s.getAttributeNS(R_NS, 'id') ?? s.getAttribute('r:id')
    let target = relMap.get(rid)
    if (!target) continue
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')
    const doc = await xml(target)
    if (!doc) continue
    const rows = []
    for (const r of byTag(doc, 'row')) {
      const rIdx = (+r.getAttribute('r') || rows.length + 1) - 1
      if (rIdx >= MAX_ROWS) break
      const row = []
      for (const c of childrenByTag(r, 'c')) {
        const ci = c.hasAttribute('r') ? colIndex(c.getAttribute('r')) : row.length
        if (ci >= MAX_COLS) continue
        const t = c.getAttribute('t')
        const v = childrenByTag(c, 'v')[0]?.textContent
        const f = childrenByTag(c, 'f')[0]?.textContent
        let val = ''
        if (t === 's') val = shared[+v] ?? ''
        else if (t === 'inlineStr') val = byTag(c, 't').map(x => x.textContent).join('')
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE'
        else if (t === 'str' || t === 'e') val = v ?? ''
        else if (v != null && v !== '') {
          const kind = styleKind[+c.getAttribute('s') || 0]
          val = kind && Number.isFinite(+v) ? excelDate(+v, kind.date, kind.time) : formatNumber(v)
        } else if (f) val = { formula: f }
        row[ci] = val
      }
      rows[rIdx] = row
    }
    sheets.push({ name: s.getAttribute('name') ?? `Sheet${sheets.length + 1}`, rows })
  }
  await zip.close()
  return sheets
}

// ---------- ODS ----------
async function readODS(buf) {
  const { configure, ZipReader, BlobReader, TextWriter } = await import('./foliate-js/vendor/zip.js')
  configure({ useWebWorkers: false })
  const zip = new ZipReader(new BlobReader(new Blob([buf])))
  const entry = (await zip.getEntries()).find(e => e.filename === 'content.xml')
  const doc = new DOMParser().parseFromString(await entry.getData(new TextWriter()), 'application/xml')
  await zip.close()
  const TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'
  const attr = (el, name) => el.getAttributeNS(TABLE_NS, name) ?? el.getAttribute('table:' + name)
  const cellText = cell => childrenByTag(cell, 'p').map(p => p.textContent).join('\n')
  const sheets = []
  for (const table of byTag(doc, 'table').filter(t => t.namespaceURI === TABLE_NS)) {
    const rows = []
    for (const r of byTag(table, 'table-row')) {
      const row = []
      for (const c of [...r.children].filter(x => x.localName === 'table-cell' || x.localName === 'covered-table-cell')) {
        const text = cellText(c)
        const rep = Math.min(+attr(c, 'number-columns-repeated') || 1, text ? MAX_COLS : 64)
        for (let i = 0; i < rep && row.length < MAX_COLS; i++) row.push(text)
      }
      const rep = Math.min(+attr(r, 'number-rows-repeated') || 1, row.some(x => x) ? MAX_ROWS : 64)
      for (let i = 0; i < rep && rows.length < MAX_ROWS; i++) rows.push(row)
      if (rows.length >= MAX_ROWS) break
    }
    sheets.push({ name: attr(table, 'name') ?? `Sheet${sheets.length + 1}`, rows })
  }
  return sheets
}

// ---------- rendering ----------
const cellStr = v => v == null ? '' : typeof v === 'object' ? `=${v.formula}` : String(v)

function trim(rows) {
  rows = Array.from(rows, r => Array.from(r ?? [], cellStr))
  while (rows.length && rows.at(-1).every(c => !c.trim())) rows.pop()
  let width = 0
  for (const r of rows) {
    let w = r.length
    while (w && !r[w - 1]?.trim()) w--
    width = Math.max(width, w)
  }
  return { rows: rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? '')), width }
}

const isNumeric = s => /^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?%?$/i.test(s.trim()) && s.trim() !== ''

const SHEET_CSS = `
html { writing-mode: horizontal-tb !important; }
h2.sheet-name { font-size: 1.1em; margin: .2em 0 .6em; }
.cont { opacity: .55; font-size: .85em; margin: 0 0 .4em; }
.sheet-wrap { overflow-x: auto; max-width: 100%; margin: 0 0 1.5em; }
table.sheet { border-collapse: collapse; font-family: system-ui, "Noto Sans", "Noto Sans CJK JP", sans-serif; font-size: .78em; line-height: 1.4; }
table.sheet th, table.sheet td { border: 1px solid rgba(127,127,127,.35); padding: .25em .6em; vertical-align: top; white-space: pre-wrap; max-width: 28em; overflow-wrap: anywhere; text-align: left; }
table.sheet thead th { background: rgba(127,127,127,.14); font-weight: 600; }
table.sheet tbody tr:nth-child(even) td { background: rgba(127,127,127,.05); }
table.sheet .rn { opacity: .5; text-align: right; font-variant-numeric: tabular-nums; font-weight: 400; user-select: none; -webkit-user-select: none; }
table.sheet td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.sheet td.f { opacity: .6; font-style: italic; }
`

function renderRows(rows, startRow, header) {
  const cells = (r, tag, rowNo) => `<tr><${tag} class="rn">${rowNo ?? ''}</${tag}>` +
    r.map(c => tag === 'th' ? `<th>${esc(c)}</th>`
      : `<td${c.startsWith('=') ? ' class="f"' : isNumeric(c) ? ' class="n"' : ''}>${esc(c)}</td>`).join('') + '</tr>'
  const head = header ? `<thead>${cells(header, 'th', 1)}</thead>` : ''
  const body = rows.map((r, i) => cells(r, 'td', startRow + i)).join('')
  return `<div class="sheet-wrap"><table class="sheet">${head}<tbody>${body}</tbody></table></div>`
}

export async function makeSheetBook(file) {
  const ext = file.name.toLowerCase().split('.').pop()
  const buf = await file.arrayBuffer()
  let sheets
  if (ext === 'xlsx' || ext === 'xlsm') sheets = await readXLSX(buf)
  else if (ext === 'ods') sheets = await readODS(buf)
  else {
    const text = decodeText(buf)
    sheets = [{ name: file.name, rows: parseCSV(text, detectDelimiter(text, ext)) }]
  }
  const title = file.name.replace(/\.[^.]+$/, '')
  const urls = []
  const head = `<meta charset="utf-8">${NO_SCRIPT_META}<title>${esc(title)}</title><style>${SHEET_CSS}</style>`
  const sections = [], toc = []
  sheets.forEach((sheet, k) => {
    const { rows } = trim(sheet.rows)
    // first row is used as the header (like a spreadsheet's frozen top row)
    const header = rows.length > 1 ? rows[0] : null
    const data = header ? rows.slice(1) : rows
    const first = sections.length
    const pages = Math.max(1, Math.ceil(data.length / ROWS_PER_PAGE))
    const sub = []
    for (let p = 0; p < pages; p++) {
      const chunk = data.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)
      const startRow = p * ROWS_PER_PAGE + (header ? 2 : 1)
      const label = sheets.length > 1 || p === 0
        ? (p === 0 ? `<h2 class="sheet-name" id="sheet-${k}">${esc(sheet.name)}</h2>` : `<p class="cont">${esc(sheet.name)} — ${startRow}–${startRow + chunk.length - 1}</p>`)
        : `<p class="cont">${startRow}–${startRow + chunk.length - 1}</p>`
      const body = label + (rows.length ? renderRows(chunk, startRow, header) : '<p class="cont">(empty)</p>')
      const str = `<!DOCTYPE html><html lang="en"><head>${head}</head><body>${body}</body></html>`
      const url = URL.createObjectURL(new Blob([str], { type: 'text/html' }))
      urls.push(url)
      const index = sections.length
      sections.push({ id: index, load: () => url, createDocument: () => new DOMParser().parseFromString(str, 'text/html'), size: chunk.length + 1, linear: 'yes' })
      if (pages > 1) sub.push({ label: `${startRow} – ${startRow + chunk.length - 1}`, href: String(index), subitems: null })
    }
    toc.push({ label: sheet.name, href: String(first), subitems: sub.length ? sub : null })
  })
  if (!sections.length) throw new Error('No sheets found')
  return {
    metadata: { title, language: 'en' },
    rendition: {}, dir: 'ltr', sections, toc,
    resolveHref: href => /^\d+$/.test(href.split('#')[0]) ? { index: +href.split('#')[0], anchor: () => 0 } : null,
    splitTOCHref: href => [Number((href ?? '').split('#')[0]), null],
    getTOCFragment: d => d.documentElement,
    isExternal: uri => /^\w+:/i.test(uri),
    getCover: () => null,
    destroy: () => { for (const u of urls) URL.revokeObjectURL(u) },
    isVertical: false,
    isWide: true,
    isSheet: true,
  }
}
