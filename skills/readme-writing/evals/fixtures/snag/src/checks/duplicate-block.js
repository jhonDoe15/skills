'use strict';

// Reports a run of WINDOW consecutive non-blank lines that already appeared
// earlier in the same file, compared with surrounding whitespace removed.
const WINDOW = 3;

function run(lines) {
  const seen = new Map();
  const findings = [];
  for (let start = 0; start + WINDOW <= lines.length; start += 1) {
    const block = lines.slice(start, start + WINDOW).map((line) => line.trim());
    if (block.some((line) => line === '')) continue;
    const key = block.join('\n');
    if (seen.has(key)) {
      const first = seen.get(key);
      findings.push({
        line: start + 1,
        message: `lines ${start + 1}-${start + WINDOW} repeat lines ${first + 1}-${first + WINDOW}`,
      });
      start += WINDOW - 1;
    } else {
      seen.set(key, start);
    }
  }
  return findings;
}

module.exports = { id: 'duplicate-block', run };
