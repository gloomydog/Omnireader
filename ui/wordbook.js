// Personal word book: storage, inflection matching, TSV import/export, Wiktionary lookup
const invoke = window.__TAURI__.core.invoke

let entries = []            // { id, word, meaning, examples: [{ text, book }], created, updated }
let index = new Map()       // lowercased headword -> entry (single words)
let phrases = []            // entries containing spaces or non-Latin letters (matched as substrings)

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const isPhrase = w => /\s/.test(w) || /[^\x00-\x7F]/.test(w)

function reindex() {
  index = new Map()
  phrases = []
  for (const e of entries) {
    const w = e.word.trim().toLowerCase()
    if (!w) continue
    if (isPhrase(w)) phrases.push(e)
    else index.set(w, e)
  }
}

export async function loadWords() {
  try { entries = JSON.parse(await invoke('wordbook_load')) } catch { entries = [] }
  if (!Array.isArray(entries)) entries = []
  reindex()
}

let saveTimer
function persist() {
  reindex()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => invoke('wordbook_save', { json: JSON.stringify(entries, null, 1) })
    .catch(e => console.error('wordbook save failed', e)), 250)
}

export const allWords = () => [...entries].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }))
export const wordCount = () => entries.length
export const getWord = id => entries.find(e => e.id === id) ?? null

// English inflections -> possible headwords
export function candidates(raw) {
  const w = raw.toLowerCase().replace(/[’']s$/, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  const out = [w]
  if (!w || isPhrase(w)) return out
  const undouble = b => /([bcdfgklmnprstvz])\1$/.test(b) ? [b.slice(0, -1)] : []
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) out.push(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1))
  if (w.endsWith('ied')) out.push(w.slice(0, -3) + 'y')
  for (const suf of ['ed', 'ing', 'er', 'est']) if (w.endsWith(suf) && w.length > suf.length + 2) {
    const b = w.slice(0, -suf.length)
    out.push(b, b + 'e', ...undouble(b))
    if (b.endsWith('i')) out.push(b.slice(0, -1) + 'y')
  }
  if (w.endsWith('ily')) out.push(w.slice(0, -3) + 'y')
  if (w.endsWith('ly')) out.push(w.slice(0, -2), w.slice(0, -1) + 'e')
  return [...new Set(out)].filter(x => x.length > 1)
}

export function findWord(text) {
  const t = text.trim()
  if (!t) return null
  if (isPhrase(t)) return phrases.find(e => e.word.trim().toLowerCase() === t.toLowerCase()) ?? null
  for (const c of candidates(t)) { const e = index.get(c); if (e) return e }
  return null
}

export function saveWord({ id, word, meaning, example }) {
  word = word.trim()
  if (!word) return null
  let e = id ? getWord(id) : null
  // same headword already registered -> merge
  const dup = entries.find(x => x !== e && x.word.trim().toLowerCase() === word.toLowerCase())
  if (!e && dup) e = dup
  if (!e) { e = { id: uid(), word, meaning: '', examples: [], created: Date.now() }; entries.push(e) }
  e.word = word
  e.meaning = meaning.trim()
  if (example?.text && !e.examples.some(x => x.text === example.text))
    e.examples.unshift({ text: example.text, book: example.book ?? '' })
  e.examples = e.examples.slice(0, 20)
  e.updated = Date.now()
  persist()
  return e
}

export function deleteWord(id) {
  entries = entries.filter(e => e.id !== id)
  persist()
}

export function removeExample(id, text) {
  const e = getWord(id); if (!e) return
  e.examples = e.examples.filter(x => x.text !== text)
  persist()
}

// ---------- matching inside a document ----------
const SKIP = new Set(['SCRIPT', 'STYLE', 'RT', 'RP', 'TITLE', 'svg'])
export function findMatches(doc, limit = 400) {
  const out = []
  if (!entries.length || !doc?.body) return out
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.data.trim() && !SKIP.has(n.parentNode?.nodeName) ? 1 : 2,
  })
  const tokenRe = /[A-Za-z][A-Za-z’'-]*[A-Za-z]/g
  for (let node; (node = walker.nextNode()) && out.length < limit;) {
    const text = node.data
    if (index.size) for (const m of text.matchAll(tokenRe)) {
      const e = findWord(m[0])
      if (e) out.push({ node, start: m.index, end: m.index + m[0].length, entry: e })
    }
    if (phrases.length) {
      const lower = text.toLowerCase()
      for (const e of phrases) {
        const p = e.word.trim().toLowerCase()
        for (let i = lower.indexOf(p); i >= 0; i = lower.indexOf(p, i + p.length))
          out.push({ node, start: i, end: i + p.length, entry: e })
      }
    }
  }
  return out
}

// the sentence around a range, for the example
export function sentenceAround(range) {
  try {
    let el = range.startContainer
    if (el.nodeType === 3) el = el.parentNode
    const block = el.closest('p, li, dd, blockquote, td, h1, h2, h3, h4, h5, h6, div') ?? el
    const full = block.textContent.replace(/\s+/g, ' ').trim()
    const sel = range.toString().replace(/\s+/g, ' ').trim()
    const sentences = full.match(/[^.!?。！？]+[.!?。！？]*["”’)]?/g) ?? [full]
    const s = sentences.find(x => x.includes(sel)) ?? full
    return s.trim().slice(0, 400)
  } catch { return '' }
}

// ---------- TSV ----------
const esc = s => (s ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '\\n')
const unesc = s => (s ?? '').replace(/\\n/g, '\n')

export function toTSV() {
  return 'word\tmeaning\texample\tbook\n' + allWords().map(e =>
    [e.word, e.meaning, e.examples[0]?.text, e.examples[0]?.book].map(esc).join('\t')).join('\n') + '\n'
}

function parseCSVLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

export function importText(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return 0
  const tsv = lines[0].includes('\t')
  let n = 0
  for (const [i, line] of lines.entries()) {
    const cols = tsv ? line.split('\t') : parseCSVLine(line)
    const [word, meaning = '', example = '', book = ''] = cols.map(c => unesc(c.trim()))
    if (i === 0 && /^(word|単語|headword)$/i.test(word)) continue
    if (!word) continue
    const existing = findExact(word)
    saveWord({ id: existing?.id, word, meaning: meaning || existing?.meaning || '', example: example ? { text: example, book } : null })
    n++
  }
  return n
}
const findExact = w => entries.find(e => e.word.trim().toLowerCase() === w.trim().toLowerCase())

// ---------- Wiktionary (reference only, needs network) ----------
const htmlToText = html => new DOMParser().parseFromString(html, 'text/html').body.textContent.replace(/\s+/g, ' ').trim()

export async function wiktionary(word) {
  const get = async w => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const r = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`,
        { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } finally { clearTimeout(timer) }
  }
  const w = word.trim().replace(/\s+/g, '_')
  let j = await get(w)
  if (!j && w !== w.toLowerCase()) j = await get(w.toLowerCase())
  if (!j) return { senses: [], lemma: null }
  const langs = j.en ?? Object.values(j)[0] ?? []
  const senses = langs.map(p => ({
    pos: p.partOfSpeech,
    defs: (p.definitions ?? []).map(d => htmlToText(d.definition ?? '')).filter(Boolean).slice(0, 8),
  })).filter(s => s.defs.length)
  let lemma = null
  for (const s of senses) for (const d of s.defs) {
    const m = /(?:participle|past tense|plural|singular|comparative|superlative|gerund|form|spelling) of ([\p{L}' -]+?)[.:;)]?$/iu.exec(d)
    if (m && d.length < 120) { lemma = m[1].trim(); break }
  }
  if (lemma && lemma.toLowerCase() === word.toLowerCase()) lemma = null
  return { senses, lemma }
}
