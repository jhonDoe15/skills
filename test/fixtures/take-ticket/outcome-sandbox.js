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

function createOutcomeSandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'take-ticket-outcome-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, ['init', '--quiet']);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'ticket-change.js'),
    "'use strict';\n\nmodule.exports = { state: 'settled' };\n",
  );
  runGit(root, ['add', 'src/ticket-change.js']);
  const identity = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Take Ticket Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Take Ticket Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  runGit(root, ['commit', '--quiet', '-m', 'fixture base'], identity);

  return {
    repository: Object.freeze({
      root,
      head: runGit(root, ['rev-parse', 'HEAD']),
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
