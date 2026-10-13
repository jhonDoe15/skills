'use strict';

// Footnotes: "text[^id]" references and "[^id]: note" definition blocks.
// Node only; the browser bundle is built from core.js alone.
function footnotes() {
  const notes = [];
  const order = [];
  return {
    block(block) {
      const definition = block.match(/^\[\^([\w-]+)\]:\s+([\s\S]*)$/);
      if (!definition) return false;
      notes.push({ id: definition[1], text: definition[2].replace(/\n/g, ' ') });
      return true;
    },
    inline(html) {
      return html.replace(/\[\^([\w-]+)\]/g, (_, id) => {
        if (!order.includes(id)) order.push(id);
        const number = order.indexOf(id) + 1;
        return `<sup><a href="#fn-${id}" id="fnref-${id}">${number}</a></sup>`;
      });
    },
    finish(settings) {
      if (notes.length === 0) return [];
      const { inline } = require('./core.js');
      const items = order
        .map((id) => notes.find((note) => note.id === id))
        .filter(Boolean)
        .map((note) => (
          `<li id="fn-${note.id}">${inline(note.text, { ...settings, extensions: [] })}`
          + ` <a href="#fnref-${note.id}">&#8617;</a></li>`
        ));
      return [`<section class="footnotes">\n<ol>\n${items.join('\n')}\n</ol>\n</section>`];
    },
  };
}

module.exports = { footnotes };
