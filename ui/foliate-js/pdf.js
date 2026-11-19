const pdfjsPath = path => new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()

import './vendor/pdfjs/pdf.mjs'
const pdfjsLib = globalThis.pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.mjs')

const fetchText = async url => await (await fetch(url)).text()

// https://raw.githubusercontent.com/mozilla/pdf.js/refs/tags/v5.5.207/web/text_layer_builder.css
const textLayerBuilderCSS = await fetchText(pdfjsPath('text_layer_builder.css'))

// https://raw.githubusercontent.com/mozilla/pdf.js/refs/tags/v5.5.207/web/annotation_layer_builder.css
const annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))

// ---- OmniReader: rendered-page cache + prefetch of neighbouring pages ----
const CACHE_MAX = 10
const pageIds = new WeakMap()
let nextPageId = 0
const pageKey = (page, scale) => {
    if (!pageIds.has(page)) pageIds.set(page, nextPageId++)
    return `${pageIds.get(page)}@${scale.toFixed(3)}`
}
const rasterCache = new Map()   // key -> canvas (LRU)
const inflight = new Map()      // key -> Promise<canvas>
const textCache = new WeakMap() // page -> Promise<TextContent>

const cacheGet = key => {
    const v = rasterCache.get(key)
    if (v) { rasterCache.delete(key); rasterCache.set(key, v) }
    return v
}
const cachePut = (key, canvas) => {
    rasterCache.set(key, canvas)
    while (rasterCache.size > CACHE_MAX) {
        const [k, old] = rasterCache.entries().next().value
        rasterCache.delete(k)
        old.width = old.height = 0   // free memory right away
    }
}
const rasterize = (page, scale) => {
    const key = pageKey(page, scale)
    const hit = cacheGet(key)
    if (hit) return Promise.resolve(hit)
    if (inflight.has(key)) return inflight.get(key)
    const job = (async () => {
        const viewport = page.getViewport({ scale })
        // the canvas must be in the `PDFDocument`'s `ownerDocument`
        // (`globalThis.document` by default); that's where the fonts are loaded
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        cachePut(key, canvas)
        return canvas
    })().finally(() => inflight.delete(key))
    inflight.set(key, job)
    return job
}
const getText = page => {
    if (!textCache.has(page)) textCache.set(page, page.getTextContent())
    return textCache.get(page)
}

let prefetchGen = 0
const prefetch = async (pdf, pageNumber, scale) => {
    const gen = ++prefetchGen
    // let the visible page finish painting first
    await new Promise(r => setTimeout(r, 60))
    for (const n of [pageNumber + 1, pageNumber + 2, pageNumber - 1]) {
        if (gen !== prefetchGen) return          // user moved on; newer prefetch takes over
        if (n < 1 || n > pdf.numPages) continue
        try {
            const p = await pdf.getPage(n)
            getText(p)
            await rasterize(p, scale)
        } catch { /* ignore */ }
    }
}

const render = async (page, doc, zoom, pdf) => {
    const scale = zoom * devicePixelRatio
    doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`
    doc.documentElement.style.transformOrigin = 'top left'
    doc.documentElement.style.setProperty('--scale-factor', scale)
    const viewport = page.getViewport({ scale })

    const t0 = performance.now()
    const cached = rasterCache.has(pageKey(page, scale))
    const source = await rasterize(page, scale)
    if (!doc.defaultView) return   // frame was discarded meanwhile
    // copy, so the cached canvas stays reusable
    const canvas = doc.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    canvas.getContext('2d').drawImage(source, 0, 0)
    doc.querySelector('#canvas').replaceChildren(canvas)
    globalThis.__omnireaderPdfRendered?.(page.pageNumber, Math.round(performance.now() - t0), cached)
    if (pdf) prefetch(pdf, page.pageNumber, scale)

    const container = doc.querySelector('.textLayer')
    for (const el of container.querySelectorAll(':scope > :not(.omnireader-hl)')) el.remove()
    const textLayer = new pdfjsLib.TextLayer({
        textContentSource: await getText(page),
        container, viewport,
    })
    await textLayer.render()

    // hide "offscreen" canvases appended to docuemnt when rendering text layer
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/pdf_viewer.css#L51-L58
    for (const canvas of document.querySelectorAll('.hiddenCanvasElement'))
        Object.assign(canvas.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '0',
            height: '0',
            display: 'none',
        })

    // fix text selection
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/text_layer_builder.js#L105-L107
    const endOfContent = document.createElement('div')
    endOfContent.className = 'endOfContent'
    container.append(endOfContent)
    // TODO: this only works in Firefox; see https://github.com/mozilla/pdf.js/pull/17923
    container.onpointerdown = () => container.classList.add('selecting')
    container.onpointerup = () => container.classList.remove('selecting')

    const div = doc.querySelector('.annotationLayer')
    const linkService = {
        goToDestination: () => {},
        getDestinationHash: dest => JSON.stringify(dest),
        addLinkAttributes: (link, url) => link.href = url,
    }
    await new pdfjsLib.AnnotationLayer({ page, viewport, div, linkService })
        .render({ annotations: await page.getAnnotations() })
}

const renderPage = async (page, getImageBlob, pdf) => {
    const viewport = page.getViewport({ scale: 1 })
    if (getImageBlob) {
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        const canvasContext = canvas.getContext('2d')
        await page.render({ canvasContext, viewport }).promise
        return new Promise(resolve => canvas.toBlob(resolve))
    }
    const src = URL.createObjectURL(new Blob([`
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body {
            margin: 0;
            padding: 0;
        }
        /*
        https://github.com/mozilla/pdf.js/commit/bd05b255fabfc313b194bfe9a17ccded4d90fb5a
        */
        :root {
          --user-unit: 1;
          --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
          --scale-round-x: 1px;
          --scale-round-y: 1px;
        }
        ${textLayerBuilderCSS}
        ${annotationLayerBuilderCSS}
        </style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
        <div class="annotationLayer"></div>
    `], { type: 'text/html' }))
    const onZoom = ({ doc, scale }) => render(page, doc, scale, pdf)
    return { src, onZoom }
}

const makeTOCItem = item => ({
    label: item.title,
    href: JSON.stringify(item.dest),
    subitems: item.items.length ? item.items.map(makeTOCItem) : null,
})

export const makePDF = async file => {
    const transport = new pdfjsLib.PDFDataRangeTransport(file.size, [])
    transport.requestDataRange = (begin, end) => {
        file.slice(begin, end).arrayBuffer().then(chunk => {
            transport.onDataRange(begin, chunk)
        })
    }
    const pdf = await pdfjsLib.getDocument({
        range: transport,
        cMapUrl: pdfjsPath('cmaps/'),
        standardFontDataUrl: pdfjsPath('standard_fonts/'),
        isEvalSupported: false,
        // only fetch what is needed (big files are read on demand)
        disableAutoFetch: true,
        disableStream: true,
        rangeChunkSize: 1 << 18,
    }).promise

    const book = { rendition: { layout: 'pre-paginated' } }

    const { metadata, info } = await pdf.getMetadata() ?? {}
    // TODO: for better results, parse `metadata.getRaw()`
    book.metadata = {
        title: metadata?.get('dc:title') ?? info?.Title,
        author: metadata?.get('dc:creator') ?? info?.Author,
        contributor: metadata?.get('dc:contributor'),
        description: metadata?.get('dc:description') ?? info?.Subject,
        language: metadata?.get('dc:language'),
        publisher: metadata?.get('dc:publisher'),
        subject: metadata?.get('dc:subject'),
        identifier: metadata?.get('dc:identifier'),
        source: metadata?.get('dc:source'),
        rights: metadata?.get('dc:rights'),
    }

    const outline = await pdf.getOutline()
    book.toc = outline?.map(makeTOCItem)

    const cache = new Map()
    book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
        id: i,
        load: async () => {
            const cached = cache.get(i)
            if (cached) return cached
            const url = await renderPage(await pdf.getPage(i + 1), false, pdf)
            cache.set(i, url)
            return url
        },
        size: 1000,
    }))
    book.isExternal = uri => /^\w+:/i.test(uri)
    book.resolveHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return { index }
    }
    book.splitTOCHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return [index, null]
    }
    book.getTOCFragment = doc => doc.documentElement
    book.getCover = async () => renderPage(await pdf.getPage(1), true)
    book.destroy = () => pdf.destroy()
    return book
}
