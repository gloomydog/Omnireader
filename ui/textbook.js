// txt / Markdown / HTML -> foliate-js book object
import { marked } from './vendor/marked.esm.js'
import hljs from './vendor/highlight.esm.js'

// source code / plain data files shown in the code view
export const CODE_EXTS = ('py pyw pyi js mjs cjs jsx ts tsx mts rs go c h cc cpp cxx hpp hh hxx java kt kts scala swift ' +
  'rb php pl pm lua r jl sh bash zsh fish ps1 bat cmd sql css scss sass less json jsonc json5 yaml yml toml ini cfg conf ' +
  'xml svg vue svelte dart cs fs fsx hs ml mli ex exs erl hrl clj cljs lisp el vim nix tf hcl diff patch log csv tsv ' +
  'gradle cmake mk asm s m mm zig v d nim proto graphql gql tex bib env properties gitignore dockerignore').split(' ')
  .filter(x => !['csv', 'tsv'].includes(x))
const CODE_NAMES = ['makefile', 'dockerfile', 'containerfile', 'cmakelists.txt', 'license', 'readme', 'gemfile', 'rakefile', 'vagrantfile', 'justfile']
const LANG_ALIAS = { pyw: 'python', pyi: 'python', mjs: 'javascript', cjs: 'javascript', mts: 'typescript', jsonc: 'json', json5: 'json',
  h: 'c', hh: 'cpp', hxx: 'cpp', zsh: 'bash', fish: 'bash', env: 'bash', mk: 'makefile', gradle: 'kotlin', svg: 'xml',
  vue: 'xml', svelte: 'xml', conf: 'ini', cfg: 'ini', properties: 'ini', tf: 'ini', hcl: 'ini', gitignore: 'bash',
  dockerignore: 'bash', log: 'plaintext', csv: 'plaintext', tsv: 'plaintext', makefile: 'makefile', cmakelists: 'cmake' }

export const kindOf = name => {
  const base = name.toLowerCase().split('/').pop()
  const ext = base.includes('.') ? base.split('.').pop() : ''
  if (['csv', 'tsv', 'tab', 'xlsx', 'xlsm', 'ods'].includes(ext)) return 'sheet'
  if (ext === 'docx') return 'docx'
  if (CODE_NAMES.includes(base)) return base === 'readme' || base === 'license' ? 'txt' : 'code'
  if (['md', 'markdown', 'mdown', 'mkd'].includes(ext)) return 'md'
  if (['html', 'htm', 'xhtml'].includes(ext)) return 'html'
  if (['txt', 'text'].includes(ext)) return 'txt'
  if (CODE_EXTS.includes(ext)) return 'code'
  return null
}
const langOf = name => {
  const base = name.toLowerCase().split('/').pop()
  if (base === 'makefile') return 'makefile'
  if (base === 'cmakelists.txt') return 'cmake'
  if (base === 'dockerfile' || base === 'containerfile') return 'bash'
  const ext = base.includes('.') ? base.split('.').pop() : ''
  if (ext === 'txt' || ext === 'text' || !ext) return null      // unknown: auto-detect
  const l = LANG_ALIAS[ext] ?? ext
  return hljs.getLanguage(l) ? l : null
}

// blocks scripts and plugins inside every generated page
export const NO_SCRIPT_META = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'">`

// ---------- decoding ----------
export function decodeText(buf) {
  const u8 = new Uint8Array(buf)
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3))
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2))
  if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2))
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8) } catch {}
  let best = '', bestBad = Infinity
  for (const enc of ['shift_jis', 'euc-jp', 'gb18030', 'windows-1252']) {
    try {
      const s = new TextDecoder(enc).decode(u8)
      const bad = (s.match(/�/g) ?? []).length
      if (bad < bestBad) { best = s; bestBad = bad }
    } catch {}
  }
  return best
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const isJapanese = s => {
  const sample = s.slice(0, 20000).replace(/\s/g, '')
  const ja = (sample.match(/[぀-ヿ一-鿿]/g) ?? []).length
  return sample.length > 0 && ja / sample.length > 0.1
}

// ---------- code ----------
export function looksLikeCode(text) {
  const lines = text.split('\n').slice(0, 500).filter(l => l.trim())
  if (lines.length < 3) return false
  let score = 0
  for (const l of lines) {
    if (/^(\t| {2,})\S/.test(l)) score += 0.5
    if (/[;{}(\[,]\s*$/.test(l)) score += 1
    if (/^\s*(def|class|import|from|function|const|let|var|return|if|elif|else|for|while|#include|#define|fn|pub|use|package|func|public|private|static|async|await|try|catch|switch|case|struct|enum|impl|module|export|interface|type)\b/.test(l)) score += 1
    if (/(==|!=|=>|->|::|\+=|&&|\|\||\)\s*\{)/.test(l)) score += 0.5
    if (/^\s*(\/\/|#!|\/\*|\*\s|--\s)/.test(l)) score += 0.5
  }
  return score / lines.length > 0.6
}

const AUTO_LANGS = ['c', 'cpp', 'csharp', 'java', 'kotlin', 'javascript', 'typescript', 'python', 'rust', 'go', 'ruby',
  'php', 'bash', 'shell', 'sql', 'json', 'yaml', 'ini', 'xml', 'css', 'scss', 'lua', 'perl', 'swift', 'r', 'makefile', 'diff', 'markdown']

// highlight, then split into lines while keeping <span>s balanced on every line
function highlightLines(code, lang) {
  let html = null
  if (code.length < 2_000_000) {
    try {
      const language = lang ?? hljs.highlightAuto(code.slice(0, 20000), AUTO_LANGS).language
      if (language && language !== 'plaintext' && hljs.getLanguage(language))
        html = hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {}
  }
  if (html == null) html = esc(code)
  const lines = []
  const stack = []
  let cur = ''
  for (const [, open, close, text] of html.matchAll(/(<span[^>]*>)|(<\/span>)|([^<]+)/g)) {
    if (open) { stack.push(open); cur += open }
    else if (close) { stack.pop(); cur += close }
    else {
      const parts = text.split('\n')
      cur += parts[0]
      for (let i = 1; i < parts.length; i++) {
        lines.push(cur + '</span>'.repeat(stack.length))
        cur = stack.join('') + parts[i]
      }
    }
  }
  lines.push(cur)
  return lines
}

function codeBook(raw, name, { title } = {}) {
  const text = raw.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  const lines = highlightLines(text, langOf(name))
  const CHUNK = 600
  const width = String(lines.length).length + 1
  const urls = []
  const head = `<meta charset="utf-8">${NO_SCRIPT_META}<title>${esc(title)}</title><style>${BASE_CSS}${CODE_CSS}</style>`
  const sections = [], toc = []
  for (let start = 0, i = 0; start < lines.length; start += CHUNK, i++) {
    const end = Math.min(lines.length, start + CHUNK)
    let body = ''
    for (let n = start; n < end; n++)
      body += `<div class="l"><span class="n">${n + 1}</span><span class="c">${lines[n] || ' '}</span></div>`
    const str = `<!DOCTYPE html><html lang="en" class="codebook"><head>${head}</head><body><div class="code" style="--ln-w:${width}ch">${body}</div></body></html>`
    const url = URL.createObjectURL(new Blob([str], { type: 'text/html' }))
    urls.push(url)
    sections.push({ id: i, load: () => url, createDocument: () => new DOMParser().parseFromString(str, 'text/html'), size: end - start, linear: 'yes' })
    toc.push({ label: `${start + 1} – ${end}`, href: String(i), subitems: null })
  }
  return {
    metadata: { title, language: 'en' },
    rendition: {}, dir: 'ltr', sections,
    toc: sections.length > 1 ? toc : null,
    resolveHref: href => /^\d+$/.test(href.split('#')[0]) ? { index: +href.split('#')[0], anchor: () => 0 } : null,
    splitTOCHref: href => [Number((href ?? '').split('#')[0]), null],
    getTOCFragment: d => d.documentElement,
    isExternal: uri => /^\w+:/i.test(uri),
    getCover: () => null,
    destroy: () => { for (const u of urls) URL.revokeObjectURL(u) },
    isVertical: false,
    isCode: true,
  }
}

// ---------- txt (incl. Aozora Bunko notation) ----------
const HEADING_RE = /^\s*(第[一二三四五六七八九十百千〇零0-9０-９]+[章話部節回幕編巻]|(chapter|part|book)\s+[\w\dIVXLC]+|prologue|epilogue|序章|終章|序|跋|プロローグ|エピローグ|あとがき|まえがき)(\s|　|$|[:：.．、])/i

function aozoraLine(line) {
  let heading = null
  const h = /［＃「(.+?)」は(大|中|小)見出し］/.exec(line)
  if (h) heading = h[2] === '小' ? 3 : 2
  let s = esc(line)
  s = s.replace(/｜([^《｜]+)《([^》]+)》/g, '<ruby>$1<rt>$2</rt></ruby>')
  s = s.replace(/([一-鿿々〆ヵヶ〇仝]+)《([^》]+)》/g, '<ruby>$1<rt>$2</rt></ruby>')
  s = s.replace(/［＃[^］]*］/g, '')
  return { html: s, heading }
}

function txtToHTML(text) {
  let lines = text.replace(/\r\n?/g, '\n').split('\n')
  const aozora = /《[^》]+》|［＃/.test(text)
  let title = '', author = ''
  if (aozora) {
    // header: title, author, then a "-----" block explaining notation
    title = lines[0]?.trim() ?? ''
    author = lines[1]?.trim() ?? ''
    const dash = lines.findIndex(l => /^-{20,}/.test(l))
    if (dash >= 0 && dash < 40) {
      const end = lines.findIndex((l, i) => i > dash && /^-{20,}/.test(l))
      lines = lines.slice(end > 0 ? end + 1 : dash + 1)
    } else lines = lines.slice(2)
    const foot = lines.findIndex(l => /^底本：/.test(l))
    if (foot > 0) lines = lines.slice(0, foot)
  }
  const ja = isJapanese(text)
  const blank = lines.filter(l => !l.trim()).length / Math.max(1, lines.length)
  const out = []
  if (aozora && title) out.push(`<h1>${esc(title)}</h1>`, author ? `<p class="author">${esc(author)}</p>` : '')
  if (!ja && blank > 0.04) {
    // hard-wrapped prose: paragraphs are separated by blank lines
    let para = []
    const codeish = l => /^(\t| {2,})\S/.test(l) || /[;{}]\s*$/.test(l) || /^\s*(def|class|import|function|const|let|return|if|for|while|#include|fn|pub)\b/.test(l)
    const flush = () => {
      if (!para.length) return
      if (para.filter(codeish).length >= Math.max(1, para.length * 0.5) && para.some(l => /^(\t| {2,})/.test(l))) {
        out.push(`<pre>${esc(para.join('\n'))}</pre>`); para = []; return
      }
      const joined = para.map(l => l.trim()).join(' ').trim()
      if (para.length === 1 && joined.length < 60 && HEADING_RE.test(joined)) out.push(`<h2>${esc(joined)}</h2>`)
      else out.push(`<p>${esc(joined)}</p>`)
      para = []
    }
    for (const l of lines) l.trim() ? para.push(l.replace(/\s+$/, '')) : flush()
    flush()
  } else {
    for (const l of lines) {
      if (!l.trim()) { out.push('<p class="blank"><br></p>'); continue }
      if (aozora) {
        const { html, heading } = aozoraLine(l)
        out.push(heading ? `<h${heading}>${html.trim()}</h${heading}>` : `<p>${html}</p>`)
      } else if (l.trim().length < 40 && HEADING_RE.test(l)) out.push(`<h2>${esc(l.trim())}</h2>`)
      else out.push(`<p>${esc(l)}</p>`)
    }
  }
  return { html: out.join('\n'), title, author, ja }
}

// ---------- sanitizing ----------
const DANGEROUS = 'script, iframe, frame, frameset, object, embed, applet, base, link, meta, noscript, portal'
function sanitize(root) {
  for (const el of root.querySelectorAll(DANGEROUS)) el.remove()
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const val = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if (['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'srcdoc'].includes(name)
        && (val.startsWith('javascript:') || val.startsWith('vbscript:') || val.startsWith('data:text/html') || name === 'srcdoc'))
        el.removeAttribute(attr.name)
    }
  }
}

// ---------- local images (relative to the file) ----------
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp' }
async function inlineImages(root, dir, readFile, urls) {
  if (!dir || !readFile) return
  const imgs = [...root.querySelectorAll('img[src]')].slice(0, 300)
  await Promise.all(imgs.map(async img => {
    const src = img.getAttribute('src')
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('#') || src.startsWith('//')) {
      if (!/^(data|blob):/i.test(src)) img.removeAttribute('src')   // no remote requests
      return
    }
    try {
      const rel = decodeURIComponent(src.split(/[?#]/)[0])
      const path = new URL(rel, `file://${encodeURI(dir)}/`).pathname
      const buf = await readFile(decodeURIComponent(path))
      const type = MIME_BY_EXT[path.split('.').pop().toLowerCase()] ?? ''
      const url = URL.createObjectURL(new Blob([buf], { type }))
      urls.push(url)
      img.setAttribute('src', url)
    } catch { img.removeAttribute('src') }
  }))
}

// ---------- book ----------
const BASE_CSS = `
img, svg, video { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; background: rgba(127,127,127,.12); padding: .8em 1em; border-radius: 6px; font-size: .86em; line-height: 1.5; }
code, kbd, samp { font-family: "JetBrains Mono", "Source Code Pro", "DejaVu Sans Mono", monospace; font-size: .9em; }
:not(pre) > code { background: rgba(127,127,127,.14); padding: .1em .35em; border-radius: 4px; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid rgba(127,127,127,.4); padding: .3em .6em; vertical-align: top; }
blockquote { margin: 1em 0; padding: 0 0 0 1em; border-left: 3px solid rgba(127,127,127,.45); }
h1, h2, h3, h4 { line-height: 1.35; }
hr { border: 0; border-top: 1px solid rgba(127,127,127,.4); margin: 2em 0; }
li > p { margin: .2em 0; }
td > p, th > p { margin: 0; }
.subtitle { font-weight: 400; opacity: .75; }
.txt p { margin: 0; white-space: pre-wrap; }
.txt.latin p { margin: 0 0 .9em; text-indent: 0; }
.txt .blank { line-height: 1; }
.txt .author { margin: 1em 0 3em; text-align: end; }
`
const MONO = `"JetBrains Mono", "Source Code Pro", "Noto Sans Mono", "DejaVu Sans Mono", "Noto Sans Mono CJK JP", monospace`
const CODE_CSS = `
html.codebook { writing-mode: horizontal-tb !important; }
.code { font-family: ${MONO}; font-size: .8em; line-height: 1.55; }
.code .l { display: flex; }
.code .n { flex: 0 0 var(--ln-w); text-align: right; padding-right: 1.6ch; opacity: .38; user-select: none; -webkit-user-select: none; font-variant-numeric: tabular-nums; }
.code .c { flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; }
`
const VERTICAL_CSS = `html { writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; }`

/**
 * @param {Blob} file
 * @param {{ dir?: string, vertical?: 'auto'|'on'|'off', readFile?: (path:string)=>Promise<ArrayBuffer> }} opts
 */
export async function makeTextBook(file, { dir, vertical = 'auto', textMode = 'auto', readFile } = {}) {
  const kind = kindOf(file.name)
  const buf = await file.arrayBuffer()
  const raw = kind === 'docx' ? '' : decodeText(buf)
  if (kind === 'code' ? textMode !== 'prose' : kind === 'txt' && (textMode === 'code' || (textMode === 'auto' && looksLikeCode(raw))))
    return codeBook(raw, file.name, { title: file.name })
  const urls = []
  let title = '', author = '', lang = 'en', ja = false, styles = '', bodyClass = ''
  const doc = document.implementation.createHTMLDocument('')

  if (kind === 'txt' || kind === 'code') {
    const r = txtToHTML(raw)
    doc.body.innerHTML = r.html
    title = r.title; author = r.author; ja = r.ja
    bodyClass = 'txt' + (ja ? '' : ' latin')
  } else if (kind === 'docx') {
    const { default: mammoth } = await import('./vendor/mammoth.esm.js')
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buf }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2.subtitle:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Intense Quote'] => blockquote:fresh",
        "r[style-name='Strong'] => strong",
      ],
    })
    doc.body.innerHTML = value
    ja = isJapanese(doc.body.textContent)
  } else if (kind === 'md') {
    const src = raw.replace(/^---\n[\s\S]*?\n---\n/, '')   // drop YAML front matter
    doc.body.innerHTML = marked.parse(src, { gfm: true, async: false })
    ja = isJapanese(src)
    for (const code of doc.body.querySelectorAll('pre > code')) {
      const lang = /language-([\w+#-]+)/.exec(code.className)?.[1]
      try {
        if (lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(code.textContent, { language: lang, ignoreIllegals: true }).value
      } catch {}
    }
  } else {
    const parsed = new DOMParser().parseFromString(raw, 'text/html')
    title = parsed.title?.trim() ?? ''
    lang = parsed.documentElement.getAttribute('lang') || ''
    sanitize(parsed.documentElement)
    styles = [...parsed.querySelectorAll('style')].map(s => `<style>${s.textContent}</style>`).join('')
    doc.body.innerHTML = parsed.body?.innerHTML ?? ''
    ja = isJapanese(doc.body.textContent)
  }
  sanitize(doc.body)
  await inlineImages(doc.body, dir, readFile, urls)
  if (!lang) lang = ja ? 'ja' : 'en'
  if (ja && lang === 'en') lang = 'ja'
  if (!title) title = doc.body.querySelector('h1')?.textContent.trim() ?? ''
  const isVertical = vertical === 'on' || (vertical === 'auto' && kind === 'txt' && ja)

  // unwrap single wrapper elements so we can split into sections
  let root = doc.body
  while (root.children.length === 1 && root.firstElementChild.children.length > 1
    && !/^(P|PRE|TABLE|UL|OL|DL|BLOCKQUOTE|FIGURE)$/.test(root.firstElementChild.tagName))
    root = root.firstElementChild

  // ids for headings (TOC targets)
  let hid = 0
  for (const h of root.querySelectorAll('h1, h2, h3')) if (!h.id) h.id = `omnireader-h${hid++}`

  // split: at h1/h2 once a section has some substance, or when it gets long
  const groups = []
  let cur = [], len = 0
  for (const node of [...root.childNodes]) {
    const isHead = node.nodeType === 1 && /^H[12]$/.test(node.tagName)
    const n = node.textContent?.length ?? 0
    if (cur.length && ((isHead && len > 4000) || len + n > 40000)) { groups.push(cur); cur = []; len = 0 }
    cur.push(node); len += n
  }
  if (cur.length) groups.push(cur)
  if (!groups.length) groups.push([doc.createTextNode('')])

  const head = `<meta charset="utf-8">${NO_SCRIPT_META}<title>${esc(title)}</title>` +
    `<style>${BASE_CSS}${isVertical ? VERTICAL_CSS : ''}</style>${styles}`
  const idMap = new Map()
  const tocFlat = []
  const sections = groups.map((nodes, index) => {
    const wrap = doc.createElement('div')
    for (const n of nodes) wrap.append(n)
    for (const el of wrap.querySelectorAll('[id]')) idMap.set(el.id, index)
    for (const el of nodes) if (el.nodeType === 1 && el.id) idMap.set(el.id, index)
    for (const h of wrap.querySelectorAll('h1, h2, h3'))
      tocFlat.push({ label: h.textContent.replace(/\s+/g, ' ').trim(), href: `${index}#${h.id}`, level: +h.tagName[1] })
    const str = `<!DOCTYPE html><html lang="${lang}"><head>${head}</head><body class="${bodyClass}">${wrap.innerHTML}</body></html>`
    const blob = new Blob([str], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    urls.push(url)
    return {
      id: index,
      load: () => url,
      createDocument: () => new DOMParser().parseFromString(str, 'text/html'),
      size: wrap.textContent.length || 1,
      linear: 'yes',
    }
  })

  // nest TOC by heading level
  const toc = []
  const stack = []
  for (const item of tocFlat.filter(x => x.label)) {
    const node = { label: item.label, href: item.href, subitems: [] }
    while (stack.length && stack.at(-1).level >= item.level) stack.pop()
    ;(stack.length ? stack.at(-1).node.subitems : toc).push(node)
    stack.push({ level: item.level, node })
  }
  const clean = items => items.map(i => ({ ...i, subitems: i.subitems.length ? clean(i.subitems) : null }))

  return {
    metadata: { title, author, language: lang },
    rendition: {},
    dir: 'ltr',
    sections,
    toc: clean(toc),
    resolveHref: href => {
      const [a, b] = href.split('#')
      if (/^\d+$/.test(a)) return { index: +a, anchor: d => (b && d.getElementById(b)) || 0 }
      if (b && idMap.has(b)) return { index: idMap.get(b), anchor: d => d.getElementById(b) }
      return null
    },
    splitTOCHref: href => { const [a, b] = (href ?? '').split('#'); return [Number(a), b] },
    getTOCFragment: (d, id) => d.getElementById(id),
    isExternal: uri => /^\w+:/i.test(uri),
    getCover: () => null,
    destroy: () => { for (const u of urls) URL.revokeObjectURL(u) },
    isVertical,
  }
}
