'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  loadImplementationOutcomeHoldouts,
} = require('./implementation-outcome-holdouts');
const {
  createImplementationOutcomePlan,
  createPairManifest,
  createRunIndex,
  validateImplementationOutcomePlan,
  validateRunIndex,
} = require('./implementation-outcomes');
const {
  runPairWorkflow,
} = require('./implementation-outcome-runner');
const {
  replayOutcomeGrades,
} = require('./implementation-outcome-grading');

class ImplementationOutcomeCampaignError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImplementationOutcomeCampaignError';
  }
}

function readJson(file, field = file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ImplementationOutcomeCampaignError(
      `cannot read ${field}: ${error.message}`,
    );
  }
}

function pathEscapes(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
}

function ensureArtifactDirectory(repositoryRoot, artifactDirectory) {
  const allowed = path.resolve(repositoryRoot, '.artifacts');
  const target = path.resolve(artifactDirectory);
  if (pathEscapes(allowed, target)) {
    throw new ImplementationOutcomeCampaignError(
      'artifact directory must remain under .artifacts',
    );
  }
  fs.mkdirSync(allowed, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  const realAllowed = fs.realpathSync(allowed);
  const realTarget = fs.realpathSync(target);
  if (realTarget !== target || pathEscapes(realAllowed, realTarget)) {
    throw new ImplementationOutcomeCampaignError(
      'artifact directory must not traverse a symlink',
    );
  }
  return target;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, file);
}

function selectedCases(catalog, requested) {
  const ids = requested?.length > 0
    ? requested
    : catalog.cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new ImplementationOutcomeCampaignError(
      'selected cases contain duplicates',
    );
  }
  return ids.map((id) => {
    const value = catalog.cases.find((candidate) => candidate.id === id);
    if (!value) {
      throw new ImplementationOutcomeCampaignError(`unknown case "${id}"`);
    }
    return value;
  });
}

function requireConfiguration(configuration) {
  if (configuration?.schema_version !== 1
    || configuration.kind !== 'implementation-outcome-configuration'
    || !/^[a-f0-9]{40}$/.test(configuration.candidate_revision || '')
    || !/^[a-f0-9]{40}$/.test(configuration.base_revision || '')
    || typeof configuration.repository_url !== 'string'
    || typeof configuration.randomization_seed !== 'string') {
    throw new ImplementationOutcomeCampaignError(
      'implementation outcome configuration is invalid',
    );
  }
  return configuration;
}

function buildPlan({ repositoryRoot, configuration }) {
  requireConfiguration(configuration);
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const cases = selectedCases(catalog, configuration.selected_cases).map(
    (holdoutCase) => {
      const ticketDigests = new Map(
        holdoutCase.tickets.map(({ id, digest }) => [id, digest]),
      );
      return {
        id: holdoutCase.id,
        repositoryUrl: configuration.repository_url,
        baseRevision: configuration.base_revision,
        fixtureDigest: holdoutCase.fixtureDigest,
        sourceDigest: holdoutCase.sourceDigest,
        oracleDigest: holdoutCase.oracleDigest,
        tickets: holdoutCase.oracle.ticket_graph.map((ticket) => ({
          ...ticket,
          ticketDigest: ticketDigests.get(ticket.id),
        })),
      };
    },
  );
  return {
    plan: createImplementationOutcomePlan({
      candidateRevision: configuration.candidate_revision,
      cases,
      models: configuration.models,
      repetitions: configuration.repetitions,
      randomizationSeed: configuration.randomization_seed,
    }),
    catalog,
  };
}

function prepareOutcomeCampaign({
  repositoryRoot,
  configurationPath,
  artifactDirectory,
}) {
  const configuration = readJson(configurationPath, 'configuration');
  const { plan, catalog } = buildPlan({ repositoryRoot, configuration });
  const output = ensureArtifactDirectory(repositoryRoot, artifactDirectory);
  writeJson(path.join(output, 'configuration.json'), configuration);
  writeJson(path.join(output, 'plan.json'), plan);
  writeJson(path.join(output, 'catalog.json'), {
    schemaVersion: catalog.schemaVersion,
    kind: catalog.kind,
    source: catalog.source,
    runtimeFingerprint: catalog.runtime.fingerprint,
    cases: catalog.cases.map((holdoutCase) => ({
      id: holdoutCase.id,
      fixtureDigest: holdoutCase.fixtureDigest,
      sourceDigest: holdoutCase.sourceDigest,
      oracleDigest: holdoutCase.oracleDigest,
    })),
    fingerprint: catalog.fingerprint,
  });
  return { plan, catalog, artifactDirectory: output };
}

function pairIndexPath(artifactDirectory, pair) {
  return path.join(
    artifactDirectory,
    'run',
    'pairs',
    `${pair.fingerprint}.json`,
  );
}

function campaignPairs(plan) {
  return plan.cases.flatMap((caseDefinition) => (
    Array.from({ length: plan.repetitions }, (_, index) => (
      createPairManifest(plan, caseDefinition.id, index + 1)
    ))
  ));
}

async function runOutcomeCampaign({
  repositoryRoot,
  plan,
  artifactDirectory,
  executeStage,
  resume = false,
}) {
  validateImplementationOutcomePlan(plan);
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const output = ensureArtifactDirectory(repositoryRoot, artifactDirectory);
  const results = [];
  for (const pair of campaignPairs(plan)) {
    const caseDefinition = plan.cases.find(({ id }) => id === pair.caseId);
    const holdoutCase = catalog.cases.find(({ id }) => id === pair.caseId);
    if (!holdoutCase
      || holdoutCase.oracleDigest !== caseDefinition.oracleDigest) {
      throw new ImplementationOutcomeCampaignError(
        `case "${caseDefinition.id}" oracle changed after planning`,
      );
    }
    const indexPath = pairIndexPath(output, pair);
    let index;
    if (fs.existsSync(indexPath)) {
      if (!resume) {
        throw new ImplementationOutcomeCampaignError(
          `pair "${pair.fingerprint}" already has run evidence`,
        );
      }
      index = readJson(indexPath, 'pair run index');
      validateRunIndex(index, plan, pair);
    } else {
      index = createRunIndex(plan, pair);
    }
    index = await runPairWorkflow({
      plan,
      pair,
      index,
      executeStage(coordinates, currentIndex) {
        return executeStage({
          coordinates,
          currentIndex,
          pair,
          plan,
          holdoutCase,
            runtimeFingerprint: catalog.runtime.fingerprint,
          artifactDirectory: output,
        });
      },
      persist(next) {
        writeJson(indexPath, next);
      },
    });
    results.push({ pair, index });
  }
  return Object.freeze(results);
}

function artifactPath(artifactDirectory, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('artifact://')) {
    throw new ImplementationOutcomeCampaignError('artifact pointer is invalid');
  }
  const target = path.resolve(
    artifactDirectory,
    pointer.slice('artifact://'.length),
  );
  if (pathEscapes(artifactDirectory, target)) {
    throw new ImplementationOutcomeCampaignError('artifact pointer escapes');
  }
  return target;
}

function replayOutcomeCampaign({
  repositoryRoot,
  plan,
  artifactDirectory,
}) {
  validateImplementationOutcomePlan(plan);
  const pairs = campaignPairs(plan);
  const grades = pairs.map((pair) => {
    const index = readJson(pairIndexPath(artifactDirectory, pair), 'pair index');
    validateRunIndex(index, plan, pair);
    if (!index.complete) {
      throw new ImplementationOutcomeCampaignError(
        `pair "${pair.fingerprint}" is incomplete`,
      );
    }
    const grading = index.checkpoints.find((checkpoint) => (
      checkpoint.arm === 'pair' && checkpoint.stage === 'grading'
    ));
    return readJson(
      artifactPath(artifactDirectory, grading.evidencePointer),
      'pair grade',
    );
  });
  const replay = replayOutcomeGrades({
    planFingerprint: plan.fingerprint,
    expectedPairFingerprints: pairs.map(({ fingerprint }) => fingerprint),
    grades,
  });
  const output = ensureArtifactDirectory(repositoryRoot, artifactDirectory);
  writeJson(path.join(output, 'replay', 'aggregate.json'), replay);
  return replay;
}

module.exports = {
  ImplementationOutcomeCampaignError,
  buildPlan,
  prepareOutcomeCampaign,
  replayOutcomeCampaign,
  runOutcomeCampaign,
  writeJson,
};
