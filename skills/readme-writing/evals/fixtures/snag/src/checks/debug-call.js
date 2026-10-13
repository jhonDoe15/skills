'use strict';

const PATTERNS = {
  python: /\bbreakpoint\(\)|\bpdb\.set_trace\(\)/,
  typescript: /^\s*debugger;|\bconsole\.log\(/,
};

function run(lines, language) {
  const findings = [];
  lines.forEach((line, index) => {
    if (PATTERNS[language].test(line)) {
      findings.push({ line: index + 1, message: 'debugger call left in code' });
    }
  });
  return findings;
}

module.exports = { id: 'debug-call', run };
