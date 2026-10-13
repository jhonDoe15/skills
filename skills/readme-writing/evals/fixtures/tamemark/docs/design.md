# Design

## Purpose

tamemark renders Markdown you did not write (comments, issue bodies, user
profiles) into HTML you can put on a page without a separate sanitizer. Safety
is the default: raw HTML in the input is dropped, and links whose target is not
`http:`, `https:`, `mailto:`, or a relative path keep their text but lose the
link. The cost is that Markdown which relies on embedded HTML loses it. You can
turn raw HTML back on with the `allowHtml: true` option, or `--allow-html` on
the command line, and then sanitizing the output is your job.

We support a small subset of Markdown (headings, paragraphs, emphasis, inline
code, links, flat lists) so the safe-by-default guarantee stays easy to audit.

## Builds

- `src/index.js` is the Node entry point. It adds the footnotes extension
  (`src/footnotes.js`) to the core renderer.
- `dist/tamemark.browser.js` is generated from `src/core.js` by
  `scripts/build-browser.js` and exposes `window.tamemark.render`. It leaves out
  the footnotes extension to keep the bundle free of Node module loading, so
  footnote markers stay as plain text in the browser.
- `bin/tamemark.js` is the command-line interface. It uses the Node build.

## Extensions

An extension is an object with optional `block(text)`, `inline(html)`, and
`finish(settings)` hooks. `block` returns true when it consumes a block.
`inline` rewrites already-escaped HTML. `finish` returns blocks to append.
Extensions are internal; the public API is `render(markdown, options)`.
