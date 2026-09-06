'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  loadCanonicalSuite,
  resolvePackageDependencies,
} = require('..');
const {
  fingerprintValue,
  validateEvaluationDefinition,
} = require('../evaluation');

const HOLDOUT_KIND = 'implementation-planning-external-holdouts';
const PLAN_KIND = 'adoption-external-holdout-plan';
const MANIFEST_KIND = 'adoption-external-holdout-manifest';
const DEFAULT_MANIFEST = path.join(
  'external-holdouts',
  'implementation-planning',
  'manifest.json',
);
const HOSTS = Object.freeze(['claude-code', 'cursor']);
const TIERS = Object.freeze(['ordinary', 'frontier']);
const RUNTIME_DIRECTORIES = Object.freeze([
  'assets',
  'references',
  'schemas',
  'scripts',
]);

class HoldoutContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HoldoutContractError';
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactFields(value, expected, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HoldoutContractError(`${field} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const fields = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(fields)) {
    throw new HoldoutContractError(
      `${field} must contain exactly ${fields.join(', ')}`,
    );
  }
}

function string(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HoldoutContractError(`${field} must be a non-empty string`);
  }
  return value;
}

function stringArray(value, field, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new HoldoutContractError(
      `${field} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`,
    );
  }
  value.forEach((item, index) => string(item, `${field}[${index}]`));
  if (new Set(value).size !== value.length) {
    throw new HoldoutContractError(`${field} contains duplicates`);
  }
  return value;
}

function safeRelativePath(value, field) {
  string(value, field);
  if (value.includes('\\')
    || value === '.'
    || value.startsWith('../')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value) {
    throw new HoldoutContractError(`${field} must be a contained relative path`);
  }
  return value;
}

function pathEscapes(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
}

function regularFile(root, relativePath, field) {
  safeRelativePath(relativePath, field);
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (pathEscapes(absoluteRoot, absolutePath)) {
    throw new HoldoutContractError(`${field} escapes the holdout root`);
  }
  let current = absoluteRoot;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    let status;
    try {
      status = fs.lstatSync(current);
    } catch {
      throw new HoldoutContractError(`${field} does not exist`);
    }
    if (status.isSymbolicLink()) {
      throw new HoldoutContractError(`${field} must not traverse a symlink`);
    }
  }
  const status = fs.lstatSync(absolutePath);
  if (!status.isFile()) {
    throw new HoldoutContractError(`${field} must be a regular file`);
  }
  return {
    bytes: fs.readFileSync(absolutePath),
    path: absolutePath,
  };
}

function parseJson(bytes, field) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new HoldoutContractError(`${field} is invalid JSON: ${error.message}`);
  }
}

function immutableRevision(input, field) {
  const matches = [...input.matchAll(
    /^Immutable revision: `([a-f0-9]{40})`$/gm,
  )];
  if (matches.length !== 1) {
    throw new HoldoutContractError(
      `${field} must contain exactly one 40-hex immutable revision`,
    );
  }
  return matches[0][1];
}

function validateOracle(oracle, field, expectedInput) {
  exactFields(oracle, [
    'schema_version',
    'prompt',
    'labels',
    'expected_status',
    'expected_output',
    'expectations',
    'critical_forbidden_outcomes',
    'input',
  ], field);
  if (oracle.schema_version !== 1) {
    throw new HoldoutContractError(`${field}.schema_version must be 1`);
  }
  string(oracle.prompt, `${field}.prompt`);
  stringArray(oracle.labels, `${field}.labels`);
  string(oracle.expected_status, `${field}.expected_status`);
  string(oracle.expected_output, `${field}.expected_output`);
  stringArray(oracle.expectations, `${field}.expectations`);
  stringArray(
    oracle.critical_forbidden_outcomes,
    `${field}.critical_forbidden_outcomes`,
  );
  if (oracle.input !== expectedInput) {
    throw new HoldoutContractError(`${field}.input does not match the manifest`);
  }
}

function loadExternalHoldouts({
  repositoryRoot,
  manifestPath = path.join(repositoryRoot, DEFAULT_MANIFEST),
}) {
  const absoluteManifest = path.resolve(manifestPath);
  if (pathEscapes(repositoryRoot, absoluteManifest)) {
    throw new HoldoutContractError(
      'holdout manifest must remain inside the repository',
    );
  }
  const relativeManifest = path.relative(repositoryRoot, absoluteManifest)
    .split(path.sep).join('/');
  const holdoutRoot = path.dirname(absoluteManifest);
  const manifestFile = regularFile(
    repositoryRoot,
    relativeManifest,
    'holdout manifest',
  );
  const manifest = parseJson(manifestFile.bytes, 'holdout manifest');
  exactFields(
    manifest,
    ['schema_version', 'kind', 'cases'],
    'holdout manifest',
  );
  if (manifest.schema_version !== 1 || manifest.kind !== HOLDOUT_KIND) {
    throw new HoldoutContractError('holdout manifest version or kind is invalid');
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new HoldoutContractError('holdout manifest.cases must be non-empty');
  }

  const ids = new Set();
  const selectors = new Set();
  const cases = manifest.cases.map((entry, index) => {
    const field = `holdout manifest.cases[${index}]`;
    exactFields(entry, ['id', 'domain', 'input', 'oracle'], field);
    const id = string(entry.id, `${field}.id`);
    const domain = string(entry.domain, `${field}.domain`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(domain)) {
      throw new HoldoutContractError(`${field} id and domain must be slugs`);
    }
    const selector = `${domain}/${id}`;
    if (ids.has(id) || selectors.has(selector)) {
      throw new HoldoutContractError(`duplicate holdout case "${selector}"`);
    }
    ids.add(id);
    selectors.add(selector);
    const expectedInput = `${selector}/input.md`;
    const expectedOracle = `${selector}/oracle.json`;
    if (entry.input !== expectedInput || entry.oracle !== expectedOracle) {
      throw new HoldoutContractError(
        `${field} paths must match its domain and id`,
      );
    }
    const inputFile = regularFile(holdoutRoot, entry.input, `${field}.input`);
    const oracleFile = regularFile(holdoutRoot, entry.oracle, `${field}.oracle`);
    const oracle = parseJson(oracleFile.bytes, `${field}.oracle`);
    validateOracle(oracle, `${field}.oracle`, entry.input);
    const inputText = inputFile.bytes.toString('utf8');
    const revision = immutableRevision(inputText, `${field}.input`);
    const inputDigest = sha256(inputFile.bytes);
    const oracleDigest = sha256(oracleFile.bytes);
    return {
      id,
      domain,
      selector,
      input: entry.input,
      oracle: entry.oracle,
      immutable_revision: revision,
      input_digest: inputDigest,
      oracle_digest: oracleDigest,
      case_fingerprint: fingerprintValue({
        id,
        domain,
        selector,
        input: entry.input,
        oracle: entry.oracle,
        immutable_revision: revision,
        input_digest: inputDigest,
        oracle_digest: oracleDigest,
      }),
      prompt: oracle.prompt,
      labels: structuredClone(oracle.labels),
      expected_status: oracle.expected_status,
      expected_output: oracle.expected_output,
      expectations: structuredClone(oracle.expectations),
      critical_forbidden_outcomes:
        structuredClone(oracle.critical_forbidden_outcomes),
    };
  }).sort((left, right) => left.selector.localeCompare(right.selector));

  const sourceDigest = sha256(manifestFile.bytes);
  return Object.freeze({
    schema_version: 1,
    kind: HOLDOUT_KIND,
    source: relativeManifest,
    source_digest: sourceDigest,
    cases: Object.freeze(cases.map(Object.freeze)),
    fingerprint: fingerprintValue({
      kind: HOLDOUT_KIND,
      source_digest: sourceDigest,
      cases: cases.map((holdout) => ({
        selector: holdout.selector,
        case_fingerprint: holdout.case_fingerprint,
      })),
    }),
  });
}

function walkRuntimeDirectory(root, relativeRoot, skill, entries) {
  const absolute = path.join(root, relativeRoot);
  const directoryStatus = fs.lstatSync(absolute);
  if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
    throw new HoldoutContractError(
      `runtime package "${skill}/${relativeRoot}" must be a regular directory`,
    );
  }
  const children = fs.readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    if (child.name.startsWith('.')) continue;
    const relative = path.posix.join(relativeRoot, child.name);
    const source = path.join(root, ...relative.split('/'));
    const status = fs.lstatSync(source);
    if (status.isSymbolicLink()) {
      throw new HoldoutContractError(
        `runtime package "${skill}/${relative}" must not be a symlink`,
      );
    }
    if (status.isDirectory()) {
      walkRuntimeDirectory(root, relative, skill, entries);
    } else if (status.isFile()) {
      entries.push({
        skill,
        path: relative,
        digest: sha256(fs.readFileSync(source)),
      });
    } else {
      throw new HoldoutContractError(
        `runtime package "${skill}/${relative}" must be a regular file`,
      );
    }
  }
}

function compileRuntimePackage(repositoryRoot, requestedSkill) {
  const suite = loadCanonicalSuite(repositoryRoot);
  const packageDefinition = {
    skills: suite.inventory.map(({ name }) => ({ name })),
  };
  const resolution = resolvePackageDependencies(
    suite,
    packageDefinition,
    requestedSkill,
  );
  if (resolution.missingSkill) {
    throw new HoldoutContractError(
      `runtime package is missing "${resolution.missingSkill}"`,
    );
  }
  const skills = [...resolution.resolved];
  const entries = [];
  for (const skill of skills) {
    const skillRoot = path.join(repositoryRoot, 'skills', skill);
    const definition = regularFile(skillRoot, 'SKILL.md', `${skill}.SKILL.md`);
    entries.push({
      skill,
      path: 'SKILL.md',
      digest: sha256(definition.bytes),
    });
    for (const directory of RUNTIME_DIRECTORIES) {
      const source = path.join(skillRoot, directory);
      if (!fs.existsSync(source)) continue;
      walkRuntimeDirectory(skillRoot, directory, skill, entries);
    }
  }
  entries.sort((left, right) => (
    `${left.skill}/${left.path}`.localeCompare(`${right.skill}/${right.path}`)
  ));
  const runtimePackage = {
    schema_version: 1,
    kind: 'adoption-runtime-package',
    skills,
    entries,
  };
  runtimePackage.fingerprint = fingerprintValue(runtimePackage);
  return runtimePackage;
}

function normalizedSelectorValues(values, field) {
  if (values === undefined || values === null) return [];
  stringArray(values, field, true);
  return [...values].sort();
}

function selectHoldouts(catalog, selectors = {}) {
  const selectorFields = ['cases', 'domains', 'hosts', 'model_cells'];
  if (Object.keys(selectors).some(
    (field) => !selectorFields.includes(field),
  )) {
    throw new HoldoutContractError('selectors contain an unknown category');
  }
  const requestedCases = normalizedSelectorValues(
    selectors.cases,
    'selectors.cases',
  );
  const requestedDomains = normalizedSelectorValues(
    selectors.domains,
    'selectors.domains',
  );
  const requestedHosts = normalizedSelectorValues(
    selectors.hosts,
    'selectors.hosts',
  );
  const requestedCells = normalizedSelectorValues(
    selectors.model_cells,
    'selectors.model_cells',
  );
  const bySelector = new Map(catalog.cases.map((item) => [item.selector, item]));
  const byId = new Map(catalog.cases.map((item) => [item.id, item]));
  const knownDomains = new Set(catalog.cases.map(({ domain }) => domain));

  const selectedCases = requestedCases.length === 0
    ? catalog.cases
    : requestedCases.map((requested) => {
      const match = requested.includes('/')
        ? bySelector.get(requested)
        : byId.get(requested);
      if (!match) {
        throw new HoldoutContractError(`unknown holdout case "${requested}"`);
      }
      return match;
    });
  if (new Set(selectedCases.map(({ selector }) => selector)).size
    !== selectedCases.length) {
    throw new HoldoutContractError('selectors.cases contains duplicate cases');
  }
  for (const domain of requestedDomains) {
    if (!knownDomains.has(domain)) {
      throw new HoldoutContractError(`unknown holdout domain "${domain}"`);
    }
  }
  const domainSet = new Set(requestedDomains);
  const cases = selectedCases.filter(
    ({ domain }) => domainSet.size === 0 || domainSet.has(domain),
  );
  const canonicalCaseSelectors = cases.map(({ selector }) => selector).sort();

  for (const host of requestedHosts) {
    if (!HOSTS.includes(host)) {
      throw new HoldoutContractError(`unknown holdout host "${host}"`);
    }
  }
  const cells = requestedCells.map((value) => {
    const [host, tier, ...extra] = value.split(':');
    if (extra.length > 0 || !HOSTS.includes(host) || !TIERS.includes(tier)) {
      throw new HoldoutContractError(`unknown model cell "${value}"`);
    }
    return { host, tier };
  });
  const hostSet = new Set(requestedHosts);
  const cellSet = new Set(cells.map(({ host, tier }) => `${host}:${tier}`));
  const selectedCells = HOSTS.flatMap((host) => (
    TIERS.map((tier) => ({ host, tier }))
  )).filter(({ host, tier }) => (
    (hostSet.size === 0 || hostSet.has(host))
      && (cellSet.size === 0 || cellSet.has(`${host}:${tier}`))
  ));
  if (cases.length === 0 || selectedCells.length === 0) {
    throw new HoldoutContractError('holdout selection produced zero work');
  }
  return {
    selectors: {
      cases: canonicalCaseSelectors,
      domains: requestedDomains,
      hosts: requestedHosts,
      model_cells: requestedCells,
    },
    cases,
    cells: selectedCells,
  };
}

function holdoutDefinition(repositoryRoot, selectedCases) {
  const basePath = path.join(
    repositoryRoot,
    'skills',
    'implementation-planning',
    'evals',
    'role.json',
  );
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const definition = {
    skill_name: 'implementation-planning',
    version: 1,
    evaluation: {
      scope: 'implementation-planning-external-holdouts',
      layer: 'role',
      skill: 'implementation-planning',
      hosts: [...HOSTS],
      arms: ['no-skill', 'treatment'],
    },
    config: {
      minimum_treatment_pass_rate:
        base.config.minimum_treatment_pass_rate,
      minimum_treatment_win_rate:
        base.config.minimum_treatment_win_rate,
      randomization_seed: 'implementation-planning-external-holdouts-v1',
    },
    signals: {},
    global_required_signals: [],
    global_order: [],
    forbidden_patterns: [],
    judge: structuredClone(base.judge),
    evals: selectedCases.map((holdout) => ({
      id: holdout.selector,
      name: holdout.selector,
      prompt: holdout.prompt,
      expected_output: holdout.expected_output,
      files: [`holdout-inputs/${holdout.selector}/input.md`],
      required_skill_loads: [
        'implementation-planning',
        'engineering-guidance',
      ],
      expectations: [
        ...holdout.expectations,
        ...holdout.critical_forbidden_outcomes.map(
          (outcome) => `The output must not exhibit this outcome: ${outcome}`,
        ),
      ],
    })),
  };
  validateEvaluationDefinition(definition, repositoryRoot);
  return definition;
}

function executionEstimate(manifests, configuration) {
  let hostExecutions = 0;
  let judgeCalls = 0;
  let maximumHostExecutions = 0;
  let maximumJudgeCalls = 0;
  let hostAttempts = 0;
  let judgeAttempts = 0;
  let costCeiling = 0;
  for (const manifest of manifests) {
    const initial = manifest.cases.reduce(
      (sum, item) => sum + item.initial_repetitions,
      0,
    );
    const maximum = manifest.cases.reduce(
      (sum, item) => sum + item.mixed_repetitions,
      0,
    );
    const executions = initial * 2;
    const maximumExecutions = maximum * 2;
    hostExecutions += executions;
    judgeCalls += initial;
    maximumHostExecutions += maximumExecutions;
    maximumJudgeCalls += maximum;
    hostAttempts += maximumExecutions
      * manifest.execution_configuration.max_attempts;
    judgeAttempts += maximum
      * configuration.judge.max_attempts;
    costCeiling += maximumExecutions
      * manifest.execution_configuration.max_attempts
      * manifest.execution_configuration.budget_usd;
    costCeiling += maximum
      * configuration.judge.max_attempts
      * configuration.judge.budget_usd;
  }
  return {
    initial_calls: {
      host_executions: hostExecutions,
      judge_calls: judgeCalls,
      total: hostExecutions + judgeCalls,
    },
    maximum_calls: {
      host_executions: maximumHostExecutions,
      judge_calls: maximumJudgeCalls,
      total: maximumHostExecutions + maximumJudgeCalls,
    },
    maximum_attempts: {
      host_executions: hostAttempts,
      judge_calls: judgeAttempts,
      total: hostAttempts + judgeAttempts,
    },
    maximum_configured_cost_ceiling_usd:
      Number(costCeiling.toFixed(6)),
  };
}

function compileFocusedHoldoutPlan({
  repositoryRoot,
  configuration,
  selectors = {},
  manifestPath,
}) {
  const catalog = loadExternalHoldouts({ repositoryRoot, manifestPath });
  const selection = selectHoldouts(catalog, selectors);
  const definition = holdoutDefinition(repositoryRoot, selection.cases);
  const definitionFingerprint = fingerprintValue(definition);
  const runtimePackage = compileRuntimePackage(
    repositoryRoot,
    'implementation-planning',
  );
  const configurationFingerprint = fingerprintValue(configuration);
  const manifests = selection.cells.map(({ host, tier }) => {
    const run = configuration.hosts[host][tier];
    const manifest = {
      schema_version: 2,
      kind: MANIFEST_KIND,
      id: `implementation-planning-external-holdouts:${host}:${tier}`,
      configuration_fingerprint: configurationFingerprint,
      candidate: structuredClone(configuration.candidate),
      definition: {
        scope: definition.evaluation.scope,
        layer: definition.evaluation.layer,
        skill: definition.evaluation.skill,
        version: definition.version,
        source: catalog.source,
        origin: 'external-holdout',
        fingerprint: definitionFingerprint,
      },
      cell: {
        host,
        tier,
        model: structuredClone(run.model),
      },
      execution_configuration: {
        host_adapter: host === 'claude-code'
          ? 'claude-code-production-v1'
          : 'cursor-local-production-v1',
        settings_precedence: 'inline-and-project-only',
        timeout_ms: run.timeout_ms,
        budget_usd: run.budget_usd,
        max_attempts: run.max_attempts,
      },
      execution_status: host === 'cursor'
        ? {
          runnable: false,
          blocker: 'Cursor SDK has no enforceable per-run budget cap.',
        }
        : { runnable: true, blocker: null },
      judge: structuredClone(configuration.judge),
      arms: ['no-skill', 'treatment'],
      cases: selection.cases.map((holdout) => ({
        id: holdout.selector,
        name: holdout.selector,
        selector: holdout.selector,
        critical: false,
        initial_repetitions: configuration.repetitions.ordinary,
        mixed_repetitions: configuration.repetitions.mixed,
        input: {
          source: holdout.input,
          destination: `holdout-inputs/${holdout.selector}/input.md`,
          digest: holdout.input_digest,
          immutable_revision: holdout.immutable_revision,
        },
        oracle_fingerprint: holdout.oracle_digest,
        case_fingerprint: holdout.case_fingerprint,
      })),
      thresholds: structuredClone(definition.config),
      randomization_seed: definition.config.randomization_seed,
      planning_semantics: true,
      runtime_package_fingerprint: runtimePackage.fingerprint,
    };
    manifest.execution_fingerprint = fingerprintValue({
      candidate: manifest.candidate,
      definition: manifest.definition,
      cell: manifest.cell,
      execution_configuration: manifest.execution_configuration,
      judge: manifest.judge,
      arms: manifest.arms,
      cases: manifest.cases,
      runtime_package_fingerprint: manifest.runtime_package_fingerprint,
    });
    manifest.fingerprint = fingerprintValue(manifest);
    return manifest;
  });
  const plan = {
    schema_version: 2,
    kind: PLAN_KIND,
    assessment_class: 'partial-holdout-assessment',
    canonical_release_evidence: false,
    configuration: structuredClone(configuration),
    configuration_fingerprint: configurationFingerprint,
    holdout_catalog: {
      kind: catalog.kind,
      source: catalog.source,
      source_digest: catalog.source_digest,
      fingerprint: catalog.fingerprint,
      cases: selection.cases.map((holdout) => ({
        id: holdout.id,
        domain: holdout.domain,
        selector: holdout.selector,
        input: holdout.input,
        input_digest: holdout.input_digest,
        oracle: holdout.oracle,
        oracle_digest: holdout.oracle_digest,
        case_fingerprint: holdout.case_fingerprint,
      })),
    },
    selection: {
      ...selection.selectors,
      fingerprint: fingerprintValue(selection.selectors),
    },
    definition,
    runtime_package: runtimePackage,
    coverage: {
      complete: false,
      selected_cases: selection.cases.map(({ selector }) => selector),
      selected_cells: selection.cells.map(
        ({ host, tier }) => `${host}:${tier}`,
      ),
    },
    manifests,
    execution_estimate: executionEstimate(manifests, configuration),
  };
  plan.fingerprint = fingerprintValue(plan);
  return plan;
}

function validateFocusedHoldoutPlan({
  repositoryRoot,
  plan,
  validateConfiguration,
}) {
  if (!plan || plan.kind !== PLAN_KIND) {
    throw new HoldoutContractError('focused holdout plan kind is invalid');
  }
  const contents = structuredClone(plan);
  delete contents.fingerprint;
  if (plan.fingerprint !== fingerprintValue(contents)) {
    throw new HoldoutContractError('focused holdout plan fingerprint mismatch');
  }
  const configuration = validateConfiguration(
    repositoryRoot,
    plan.configuration,
  );
  const expected = compileFocusedHoldoutPlan({
    repositoryRoot,
    configuration,
    selectors: {
      cases: plan.selection.cases,
      domains: plan.selection.domains,
      hosts: plan.selection.hosts,
      model_cells: plan.selection.model_cells,
    },
  });
  if (expected.fingerprint !== plan.fingerprint) {
    throw new HoldoutContractError(
      'focused holdout plan is stale or mismatched with holdout or runtime bytes',
    );
  }
  return expected;
}

function loadHoldoutInput(repositoryRoot, plan, plannedCase) {
  const source = plan.holdout_catalog.cases.find(
    ({ selector }) => selector === plannedCase.selector,
  );
  if (!source) {
    throw new HoldoutContractError(
      `missing holdout input for "${plannedCase.selector}"`,
    );
  }
  const holdoutRoot = path.dirname(path.join(
    repositoryRoot,
    plan.holdout_catalog.source,
  ));
  const file = regularFile(holdoutRoot, source.input, 'holdout input');
  const digest = sha256(file.bytes);
  if (digest !== plannedCase.input.digest || digest !== source.input_digest) {
    throw new HoldoutContractError(
      `holdout input "${plannedCase.selector}" changed after planning`,
    );
  }
  return Object.freeze({
    destination: plannedCase.input.destination,
    bytes: file.bytes,
    digest,
  });
}

module.exports = {
  DEFAULT_MANIFEST,
  HOLDOUT_KIND,
  HoldoutContractError,
  MANIFEST_KIND,
  PLAN_KIND,
  compileFocusedHoldoutPlan,
  compileRuntimePackage,
  loadExternalHoldouts,
  loadHoldoutInput,
  selectHoldouts,
  validateFocusedHoldoutPlan,
};
