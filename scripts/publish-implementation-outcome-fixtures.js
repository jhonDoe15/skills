#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadImplementationOutcomeHoldouts,
} = require('../suite/adoption/implementation-outcome-holdouts');

const repositoryRoot = path.resolve(__dirname, '..');
const OPTION_FIELDS = new Map([
  ['--repository', 'repository'],
  ['--acknowledge', 'acknowledgement'],
]);

function parse(argv) {
  const options = { repository: null, acknowledgement: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const field = OPTION_FIELDS.get(argument);
    if (!field) throw new Error(`unknown option: ${argument}`);
    const value = argv[++index];
    if (!value) throw new Error(`${argument} requires a value`);
    options[field] = value;
  }
  if (!options.repository) throw new Error('--repository is required');
  const expected = `publish-synthetic-outcome-fixtures:${options.repository}`;
  if (options.acknowledgement !== expected) {
    throw new Error(`exact --acknowledge value required: ${expected}`);
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed: ${String(result.stderr || result.error?.message)
        .trim().slice(0, 256)}`,
    );
  }
  return result.stdout.trim();
}

function repositoryUrl(name) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error('--repository must be owner/name');
  }
  return `https://github.com/${name}`;
}

function verifyEmptyRepository(name) {
  const branches = JSON.parse(run('gh', ['api', `repos/${name}/branches`]));
  if (!Array.isArray(branches) || branches.length !== 0) {
    throw new Error('fixture publication requires an existing empty repository');
  }
}

function copyRuntime(catalog, project) {
  for (const file of catalog.runtime.files) {
    const relative = file.path
      .replace(/^skills\//, '')
      .replace(/definition\.md$/, 'SKILL.md');
    const target = path.join(project, '.cursor', 'skills', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.absolute, target);
  }
}

function copyCases(catalog, project) {
  for (const holdoutCase of catalog.cases) {
    fs.cpSync(
      holdoutCase.fixturePath,
      path.join(project, 'cases', holdoutCase.id),
      { recursive: true },
    );
    const docs = path.join(project, 'docs', 'cases', holdoutCase.id);
    fs.mkdirSync(path.join(docs, 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(docs, 'feature.md'), holdoutCase.feature.content);
    for (const ticket of holdoutCase.tickets) {
      fs.writeFileSync(
        path.join(docs, 'tickets', `${ticket.id}.md`),
        ticket.content,
      );
    }
  }
}

function initializeProject(project, remoteUrl) {
  fs.writeFileSync(path.join(project, 'AGENTS.md'), [
    '# Synthetic outcome fixtures',
    '',
    'Change only the case directory named by the active ticket.',
    'Treat `docs/cases/<case>/feature.md` and its ticket as controlling.',
    'Use the project-local pinned skills when explicitly invoked.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(project, 'README.md'), [
    '# Agent skill outcome fixtures',
    '',
    'Synthetic code used only for blueprint-to-code evaluation.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(project, '.gitignore'), '.DS_Store\n');
  const environment = {
    ...process.env,
    GIT_AUTHOR_DATE: '2026-09-04T00:00:00Z',
    GIT_COMMITTER_DATE: '2026-09-04T00:00:00Z',
  };
  run('git', ['init', '-b', 'master'], { cwd: project, env: environment });
  run('git', ['config', 'user.name', 'Outcome Fixture Publisher'], {
    cwd: project,
  });
  run('git', ['config', 'user.email', 'outcome-fixtures@example.invalid'], {
    cwd: project,
  });
  run('git', ['add', '.'], { cwd: project });
  run('git', ['commit', '-m', 'chore: initialize outcome fixtures'], {
    cwd: project,
    env: environment,
  });
  run('git', ['remote', 'add', 'origin', remoteUrl], { cwd: project });
  run('git', ['push', '-u', 'origin', 'master'], { cwd: project });
  return run('git', ['rev-parse', 'HEAD'], { cwd: project });
}

function main(argv) {
  const options = parse(argv);
  verifyEmptyRepository(options.repository);
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-fixtures-'));
  try {
    copyRuntime(catalog, project);
    copyCases(catalog, project);
    const url = repositoryUrl(options.repository);
    const revision = initializeProject(project, url);
    console.log(JSON.stringify({
      repository_url: url,
      base_revision: revision,
      branch: 'master',
      catalog_fingerprint: catalog.fingerprint,
    }, null, 2));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
