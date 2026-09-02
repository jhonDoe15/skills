#!/usr/bin/env node
'use strict';

const path = require('node:path');

const {
  buildHumanReviewPacket,
  loadCampaignPlan,
  paidExecutionAcknowledgement,
  prepareCampaignPlan,
  replayCampaignArtifacts,
  runCampaign,
} = require('../suite/adoption/runner');

const repositoryRoot = path.resolve(__dirname, '..');

function usage() {
  return [
    'Usage: node scripts/run-adoption-campaign.js <mode> [options]',
    '',
    'Modes:',
    '  plan    Validate an exact config and write a no-spend campaign plan',
    '  run     Execute a planned campaign after exact paid acknowledgement',
    '  replay  Validate and replay retained evidence without host or judge calls',
    '  packet  Build the pending-human-adjudication review packet offline',
    '',
    'Options:',
    '  --config <path>          Exact campaign configuration (plan mode)',
    '  --plan <path>            Retained plan (run/replay/packet modes)',
    '  --artifacts-dir <path>   Artifact root; defaults during plan mode',
    '  --acknowledge-paid-execution <value>',
    '                           Exact value printed by plan mode',
    '  --resume                 Reuse only complete matching retained evidence',
    '  --json                   Print machine-readable output',
    '  --help                   Show this help',
  ].join('\n');
}

function parseArguments(argv) {
  if (argv.includes('--help')) {
    return { help: true };
  }
  const mode = argv[0];
  if (!['plan', 'run', 'replay', 'packet'].includes(mode)) {
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
  const valueOptions = new Map([
    ['--config', 'config'],
    ['--plan', 'plan'],
    ['--artifacts-dir', 'artifactDirectory'],
    ['--acknowledge-paid-execution', 'acknowledgement'],
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--resume' || argument === '--json') {
      options[argument === '--resume' ? 'resume' : 'json'] = true;
      continue;
    }
    const field = valueOptions.get(argument);
    if (!field) throw new Error(`unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;
    options[field] = field === 'acknowledgement'
      ? value
      : path.resolve(process.cwd(), value);
  }
  return options;
}

function requireOption(options, field, option) {
  if (!options[field]) throw new Error(`${option} is required`);
  return options[field];
}

function output(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    console.log(`${key}: ${item}`);
  }
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.mode === 'plan') {
    const prepared = prepareCampaignPlan({
      repositoryRoot,
      configurationPath: requireOption(options, 'config', '--config'),
      artifactDirectory: options.artifactDirectory,
    });
    output({
      artifact_directory: prepared.artifact_directory,
      plan_fingerprint: prepared.plan.fingerprint,
      initial_calls: prepared.plan.execution_estimate.initial_calls.total,
      maximum_configured_cost_ceiling_usd:
        prepared.plan.execution_estimate
          .maximum_configured_cost_ceiling_usd,
      paid_execution_acknowledgement:
        paidExecutionAcknowledgement(prepared.plan),
    }, options.json);
    return;
  }

  const planPath = requireOption(options, 'plan', '--plan');
  const plan = loadCampaignPlan({ repositoryRoot, planPath });
  const artifactDirectory = options.artifactDirectory
    || path.dirname(planPath);
  if (options.mode === 'run') {
    const index = await runCampaign({
      repositoryRoot,
      plan,
      artifactDirectory,
      acknowledgement: options.acknowledgement,
      resume: options.resume,
    });
    output({
      campaign_fingerprint: plan.fingerprint,
      run_complete: index.complete,
      run_index: path.join(artifactDirectory, 'run', 'index.json'),
      human_decision: 'pending-human-adjudication',
    }, options.json);
    return;
  }
  if (options.mode === 'replay') {
    const { aggregate } = replayCampaignArtifacts({
      repositoryRoot,
      plan,
      artifactDirectory,
    });
    output({
      campaign_fingerprint: plan.fingerprint,
      aggregate_fingerprint: aggregate.fingerprint,
      automated_aggregate_passed: aggregate.passed,
      human_decision: 'pending-human-adjudication',
    }, options.json);
    return;
  }
  const packet = buildHumanReviewPacket({
    repositoryRoot,
    plan,
    artifactDirectory,
  });
  output({
    campaign_fingerprint: plan.fingerprint,
    packet_fingerprint: packet.fingerprint,
    human_decision: packet.human_decision.status,
    packet: path.join(artifactDirectory, 'packet', 'review-packet.json'),
  }, options.json);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
