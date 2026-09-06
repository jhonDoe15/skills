#!/usr/bin/env node
'use strict';

const path = require('node:path');

const {
  buildHumanReviewPacket,
  loadCampaignPlan,
  paidExecutionAcknowledgement,
  prepareCampaignPlan,
  prepareFocusedHoldoutPlan,
  replayCampaignArtifacts,
  runCampaign,
} = require('../suite/adoption/runner');
const {
  PLAN_KIND: FOCUSED_HOLDOUT_PLAN_KIND,
} = require('../suite/adoption/holdouts');

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
    '  --external-holdouts      Build a partial external-holdout plan',
    '  --case <id|domain/id>    Select a holdout case; repeatable',
    '  --domain <domain>        Select a holdout domain; repeatable',
    '  --host <host>            Select claude-code or cursor; repeatable',
    '  --model-cell <host:tier> Select an ordinary/frontier cell; repeatable',
    '  --acknowledge-paid-execution <value>',
    '                           Exact value printed by plan mode',
    '  --allow-unbounded-cursor-execution',
    '                           Run Cursor without an enforceable SDK budget cap',
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
    allowUnboundedCursorExecution: false,
    resume: false,
    json: false,
    externalHoldouts: false,
    cases: [],
    domains: [],
    hosts: [],
    modelCells: [],
  };
  const valueOptions = new Map([
    ['--config', 'config'],
    ['--plan', 'plan'],
    ['--artifacts-dir', 'artifactDirectory'],
    ['--acknowledge-paid-execution', 'acknowledgement'],
    ['--case', 'cases'],
    ['--domain', 'domains'],
    ['--host', 'hosts'],
    ['--model-cell', 'modelCells'],
  ]);
  const booleanOptions = new Map([
    ['--resume', 'resume'],
    ['--json', 'json'],
    ['--external-holdouts', 'externalHoldouts'],
    [
      '--allow-unbounded-cursor-execution',
      'allowUnboundedCursorExecution',
    ],
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const booleanField = booleanOptions.get(argument);
    if (booleanField) {
      options[booleanField] = true;
      continue;
    }
    const field = valueOptions.get(argument);
    if (!field) throw new Error(`unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;
    if (Array.isArray(options[field])) {
      options[field].push(value);
    } else {
      options[field] = field === 'acknowledgement'
        ? value
        : path.resolve(process.cwd(), value);
    }
  }
  const hasSelectors = [
    options.cases,
    options.domains,
    options.hosts,
    options.modelCells,
  ].some((values) => values.length > 0);
  if (mode !== 'plan' && (options.externalHoldouts || hasSelectors)) {
    throw new Error('external holdout selector flags are plan-only');
  }
  if (mode !== 'run' && options.allowUnboundedCursorExecution) {
    throw new Error('--allow-unbounded-cursor-execution is run-only');
  }
  if (mode === 'plan' && hasSelectors && !options.externalHoldouts) {
    throw new Error('holdout selectors require --external-holdouts');
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

function humanDecisionStatus(plan) {
  return plan.kind === FOCUSED_HOLDOUT_PLAN_KIND
    ? 'partial-holdout-assessment'
    : 'pending-human-adjudication';
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.mode === 'plan') {
    const prepare = options.externalHoldouts
      ? prepareFocusedHoldoutPlan
      : prepareCampaignPlan;
    const prepared = prepare({
      repositoryRoot,
      configurationPath: requireOption(options, 'config', '--config'),
      artifactDirectory: options.artifactDirectory,
      ...(options.externalHoldouts
        ? {
          selectors: {
            cases: options.cases,
            domains: options.domains,
            hosts: options.hosts,
            model_cells: options.modelCells,
          },
        }
        : {}),
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
      ...(options.externalHoldouts
        ? {
          assessment_class: prepared.plan.assessment_class,
          selected_cases: prepared.plan.coverage.selected_cases.length,
          selected_cells: prepared.plan.coverage.selected_cells.length,
          blocked_cells: prepared.plan.manifests
            .filter(({ execution_status: status }) => !status.runnable)
            .map(({ cell, execution_status: status }) => (
              `${cell.host}:${cell.tier}: ${status.blocker}`
            ))
            .join('; ') || 'none',
        }
        : {}),
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
      allowUnboundedCursorExecution:
        options.allowUnboundedCursorExecution,
      resume: options.resume,
    });
    output({
      campaign_fingerprint: plan.fingerprint,
      run_complete: index.complete,
      run_index: path.join(artifactDirectory, 'run', 'index.json'),
      human_decision: humanDecisionStatus(plan),
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
      human_decision: humanDecisionStatus(plan),
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
