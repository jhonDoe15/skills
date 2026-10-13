#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

// Reads a CSV file without quoted fields, removes every column whose value is
// empty in all data rows, and writes the result to standard output.
function prune(text) {
  const rows = text.trimEnd().split('\n').map((line) => line.split(','));
  const [header, ...data] = rows;
  const keep = header.map((_, column) => (
    data.some((row) => (row[column] ?? '').trim() !== '')
  ));
  return rows
    .map((row) => row.filter((_, column) => keep[column]).join(','))
    .join('\n');
}

const file = process.argv[2];
if (!file) {
  console.error('usage: colprune <file.csv>');
  process.exitCode = 2;
} else {
  console.log(prune(fs.readFileSync(file, 'utf8')));
}
