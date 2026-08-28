'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runGit(root, arguments_, environment = process.env) {
  const result = spawnSync('git', arguments_, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${arguments_.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function commitTicketState(root, state, message, environment) {
  const sourcePath = path.join(root, 'src', 'ticket-change.js');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(
    sourcePath,
    `'use strict';\n\nmodule.exports = { state: '${state}' };\n`,
  );
  runGit(root, ['add', 'src/ticket-change.js']);
  runGit(root, ['commit', '--quiet', '-m', message], environment);
  return runGit(root, ['rev-parse', 'HEAD']);
}

function createBoundary(methods) {
  const calls = [];
  const boundary = { calls };
  for (const [name, value] of Object.entries(methods)) {
    boundary[name] = async (...arguments_) => {
      calls.push({ method: name, arguments: structuredClone(arguments_) });
      return structuredClone(value);
    };
  }
  return boundary;
}

function createOutcomeSandbox(t, { includeCorrection = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'take-ticket-outcome-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, ['init', '--quiet']);
  const identity = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Take Ticket Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Take Ticket Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  const base = commitTicketState(root, 'settled', 'fixture base', identity);
  const implementationHead = commitTicketState(
    root,
    'implemented',
    'implement ticket',
    identity,
  );
  const ranges = {
    implementation: {
      base,
      head: implementationHead,
    },
  };

  if (includeCorrection) {
    ranges.correction = {
      base: implementationHead,
      head: commitTicketState(
        root,
        'corrected',
        'correct ticket',
        identity,
      ),
    };
  }

  return {
    repository: Object.freeze({
      root,
      head: runGit(root, ['rev-parse', 'HEAD']),
      ranges,
    }),
    tracker: createBoundary({
      readTicket: { number: 43, state: 'open', blocked: false },
    }),
    pr: createBoundary({
      readPullRequest: { state: 'sandboxed' },
    }),
    ci: createBoundary({
      validate: { status: 'passed' },
    }),
  };
}

module.exports = { createOutcomeSandbox };
