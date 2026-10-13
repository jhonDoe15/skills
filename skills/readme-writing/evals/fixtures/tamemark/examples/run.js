'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { render } = require('../src/index.js');

const input = fs.readFileSync(path.join(__dirname, 'input.md'), 'utf8');
process.stdout.write(render(input));
