'use strict';

const core = require('./core.js');
const { footnotes } = require('./footnotes.js');

// Node entry point: the core renderer plus the footnotes extension.
function render(markdown, options = {}) {
  return core.render(markdown, { ...options, extensions: [footnotes()] });
}

module.exports = { render };
