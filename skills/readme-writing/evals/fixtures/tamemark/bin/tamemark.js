#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { render } = require('../src/index.js');

const args = process.argv.slice(2);
const allowHtml = args.includes('--allow-html');
const files = args.filter((arg) => arg !== '--allow-html');
if (files.length !== 1) {
  console.error('usage: tamemark [--allow-html] <file.md>');
  process.exitCode = 2;
} else {
  process.stdout.write(render(fs.readFileSync(files[0], 'utf8'), { allowHtml }));
}
