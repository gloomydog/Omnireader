# Third-party components

OmniReader bundles the following software. Each component keeps its own license.

| Component | Version | License | Location |
|---|---|---|---|
| [foliate-js](https://github.com/johnfactotum/foliate-js) | git main (2026) | MIT | `ui/foliate-js/` (modified: PDF page cache and prefetch, shorter page-turn animation, scrollable zoomed fixed layouts) |
| [PDF.js](https://github.com/mozilla/pdf.js) | 5.5.207 | Apache-2.0 | `ui/foliate-js/vendor/pdfjs/` |
| [zip.js](https://github.com/gildas-lormeau/zip.js) | (bundled with foliate-js) | BSD-3-Clause | `ui/foliate-js/vendor/zip.js` |
| [fflate](https://github.com/101arrowz/fflate) | (bundled with foliate-js) | MIT | `ui/foliate-js/vendor/fflate.js` |
| [marked](https://github.com/markedjs/marked) | 18.2.1 | MIT | `ui/vendor/marked.esm.js` (license: `ui/vendor/marked-LICENSE`) |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.12.0 | BSD-3-Clause | `ui/vendor/highlight.esm.js` (license: `ui/vendor/highlight-LICENSE`) |
| [Tauri](https://tauri.app) and its Rust dependencies | 2.x | MIT / Apache-2.0 | fetched by Cargo |

The foliate-js license is in `ui/foliate-js/LICENSE`.
