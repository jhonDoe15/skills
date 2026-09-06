#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  prepareOutcomeCampaign,
  replayOutcomeCampaign,
  runOutcomeCampaign,
} = require('../suite/adoption/implementation-outcome-campaign');
const {
  createLiveOutcomeStageExecutor,
} = require('../suite/adoption/implementation-outcome-live');
const {
  createLocalOutcomeStageExecutor,
} = require('../suite/adoption/implementation-outcome-local');
const {
  validateImplementationOutcomePlan,
} = require('../suite/adoption/implementation-outcomes');

const repositoryRoot = path.resolve(__dirname, '..');
const MODES = Object.freeze(['plan', 'run', 'replay', 'packet']);
const VALUE_OPTIONS = new Map([
  ['--config', 'config'],
  ['--plan', 'plan'],
  ['--artifacts-dir', 'artifactDirectory'],
  ['--acknowledge-unbounded-cursor', 'acknowledgement'],
]);

function usage() {
  return [
    'Usage: node scripts/run-implementation-outcome-campaign.js <mode> [options]',
    '',
    'Modes:',
    '  plan    Validate config and retain an immutable campaign plan',
    '  run     Execute or resume the stateful Cursor Cloud campaign',
    '  replay  Replay complete retained grades without model calls',
    '  packet  Write a concise human-review packet from replay',
    '',
    'Options:',
    '  --config <path>          Configuration for plan mode',
    '  --plan <path>            Retained plan for run/replay/packet',
    '  --artifacts-dir <path>   Directory below repository .artifacts',
    '  --acknowledge-unbounded-cursor <value>',
    '  --resume                 Reuse complete matching stage checkpoints',
    '  --json                   Print machine-readable output',
  ].join('\n');
}

function parse(argv) {
  if (argv.includes('--help')) return { help: true };
  const mode = argv[0];
  if (!MODES.includes(mode)) {
    throw new Error('mode must be plan, run, replay, or packet');
  }
  const options = {
    mode,
    config: null,
    plan: null,
    artifactDirectory: null,
    acknowledgement: null,
    resume: false,
    json: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--resume') {
      options.resume = true;
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    const field = VALUE_OPTIONS.get(argument);
    if (!field) throw new Error(`unknown option: ${argument}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    options[field] = field === 'acknowledgement'
      ? value
      : path.resolve(process.cwd(), value);
  }
  return options;
}

function required(options, field, name) {
  if (!options[field]) throw new Error(`${name} is required`);
  return options[field];
}

function readPlan(planPath) {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  return validateImplementationOutcomePlan(plan);
}

function acknowledgement(plan) {
  return `implementation-outcome-unbounded-cursor:${plan.fingerprint}`;
}

function createStageExecutor(plan) {
  const usesLocalRepositories = plan.cases.every(({ repositoryUrl }) => (
    repositoryUrl.startsWith('file://')
  ));
  const createExecutor = usesLocalRepositories
    ? createLocalOutcomeStageExecutor
    : createLiveOutcomeStageExecutor;
  return createExecutor({
    repositoryRoot,
    apiKey: process.env.CURSOR_API_KEY,
  });
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  for (const [name, item] of Object.entries(value)) {
    console.log(`${name}: ${item}`);
  }
}

function writePacket(artifactDirectory, replay) {
  const packetDirectory = path.join(artifactDirectory, 'packet');
  fs.mkdirSync(packetDirectory, { recursive: true });
  const packet = {
    kind: 'implementation-outcome-review-packet',
    replayFingerprint: replay.fingerprint,
    complete: replay.complete,
    passed: replay.passed,
    treatmentImprovedRate: replay.treatmentImprovedRate,
    criticalRegression: replay.criticalRegression,
    humanDecision: 'pending',
  };
  fs.writeFileSync(
    path.join(packetDirectory, 'review-packet.json'),
    `${JSON.stringify(packet, null, 2)}\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(packetDirectory, 'review-checklist.md'),
    [
      '# Blueprint-to-code outcome review',
      '',
      `- Replay complete: ${packet.complete}`,
      `- Automated outcome passed: ${packet.passed}`,
      `- Treatment improvement rate: ${packet.treatmentImprovedRate}`,
      `- Critical regression: ${packet.criticalRegression}`,
      '- [ ] Inspect every failed pair and one passing pair.',
      '- [ ] Decide whether evidence supports changing implementation-planning.',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  return packet;
}

async function main(argv) {
  const options = parse(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.mode === 'plan') {
    const prepared = prepareOutcomeCampaign({
      repositoryRoot,
      configurationPath: required(options, 'config', '--config'),
      artifactDirectory: required(
        options,
        'artifactDirectory',
        '--artifacts-dir',
      ),
    });
    print({
      plan: path.join(prepared.artifactDirectory, 'plan.json'),
      fingerprint: prepared.plan.fingerprint,
      cases: prepared.plan.cases.length,
      repetitions: prepared.plan.repetitions,
      paid_acknowledgement: acknowledgement(prepared.plan),
    }, options.json);
    return;
  }

  const planPath = required(options, 'plan', '--plan');
  const plan = readPlan(planPath);
  const artifactDirectory = options.artifactDirectory || path.dirname(planPath);
  if (options.mode === 'run') {
    if (options.acknowledgement !== acknowledgement(plan)) {
      throw new Error(
        'exact --acknowledge-unbounded-cursor value is required',
      );
    }
    const executeStage = createStageExecutor(plan);
    const pairs = await runOutcomeCampaign({
      repositoryRoot,
      plan,
      artifactDirectory,
      executeStage,
      resume: options.resume,
    });
    print({
      fingerprint: plan.fingerprint,
      complete_pairs: pairs.filter(({ index }) => index.complete).length,
      total_pairs: pairs.length,
    }, options.json);
    return;
  }

  const replay = replayOutcomeCampaign({
    repositoryRoot,
    plan,
    artifactDirectory,
  });
  if (options.mode === 'replay') {
    print({
      replay_fingerprint: replay.fingerprint,
      complete: replay.complete,
      passed: replay.passed,
      treatment_improved_rate: replay.treatmentImprovedRate,
      critical_regression: replay.criticalRegression,
    }, options.json);
    return;
  }
  const packet = writePacket(artifactDirectory, replay);
  print({
    packet: path.join(artifactDirectory, 'packet', 'review-packet.json'),
    replay_fingerprint: packet.replayFingerprint,
    human_decision: packet.humanDecision,
  }, options.json);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
