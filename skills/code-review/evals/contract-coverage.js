'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_SCOPE_OWNERS = new Map([
  ['code-review-role', 'code-review'],
  ['code-review-components', 'code-review'],
  ['code-review-outcome', 'code-review'],
  ['code-review-trigger', 'code-review'],
  ['code-review-package-closure', 'code-review'],
  ['review-worker-role', 'review-worker'],
  ['review-worker-components', 'review-worker'],
  ['review-worker-package-closure', 'review-worker'],
  ['review-coordinator-role', 'review-coordinator'],
  ['review-coordinator-components', 'review-coordinator'],
  ['review-coordinator-package-closure', 'review-coordinator'],
]);
const DEFINITION_PATHS = [
  'skills/code-review/evals/role.json',
  'skills/code-review/evals/component.json',
  'skills/code-review/evals/outcome.json',
  'skills/code-review/evals/trigger.json',
  'skills/code-review/evals/package-closure.json',
  'skills/review-worker/evals/role.json',
  'skills/review-worker/evals/component.json',
  'skills/review-worker/evals/package-closure.json',
  'skills/review-coordinator/evals/role.json',
  'skills/review-coordinator/evals/component.json',
  'skills/review-coordinator/evals/package-closure.json',
];

class ContractCoverageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractCoverageError';
  }
}

function fail(message) {
  throw new ContractCoverageError(message);
}

function readJson(repositoryRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

function normalizeDefinition(value, source) {
  const isEvaluation = value.evaluation && Array.isArray(value.evals);
  const scope = isEvaluation ? value.evaluation.scope : value.scope;
  const owner = isEvaluation ? value.skill_name : value.owner;
  const cases = isEvaluation ? value.evals : value.cases;
  if (typeof scope !== 'string' || typeof owner !== 'string'
    || !Array.isArray(cases)) {
    fail(`invalid contract definition ${source}`);
  }
  return {
    scope,
    owner,
    source,
    cases: cases.map((caseDefinition) => {
      if (Object.hasOwn(caseDefinition, 'covers')) {
        fail(`${source} case ${caseDefinition.id} uses unscoped covers`);
      }
      return {
        id: caseDefinition.id,
        covered_clauses: caseDefinition.covered_clauses,
      };
    }),
  };
}

function loadContractModel(repositoryRoot) {
  return {
    coverage: readJson(
      repositoryRoot,
      'skills/code-review/evals/contract-coverage.json',
    ),
    definitions: DEFINITION_PATHS.map((relativePath) => normalizeDefinition(
      readJson(repositoryRoot, relativePath),
      relativePath,
    )),
  };
}

function referenceKey(reference) {
  if (!reference || typeof reference !== 'object'
    || Array.isArray(reference)
    || Object.keys(reference).sort().join(',') !== 'id,scope'
    || typeof reference.scope !== 'string'
    || typeof reference.id !== 'string'
    || reference.scope.length === 0
    || reference.id.length === 0) {
    fail('contract references must use exact scoped {scope,id} objects');
  }
  return `${reference.scope}\0${reference.id}`;
}

function validateContractCoverage({ coverage, definitions }) {
  if (!coverage || coverage.version !== 1
    || typeof coverage.scope !== 'string'
    || !Array.isArray(coverage.clauses)
    || !Array.isArray(definitions)) {
    fail('contract coverage model is invalid');
  }
  const definitionIndex = new Map();
  const caseIndex = new Map();
  for (const definition of definitions) {
    const expectedOwner = EXPECTED_SCOPE_OWNERS.get(definition.scope);
    if (expectedOwner !== definition.owner) {
      fail(`definition owner does not match case scope ${definition.scope}`);
    }
    if (definitionIndex.has(definition.scope)) {
      fail(`duplicate definition scope ${definition.scope}`);
    }
    definitionIndex.set(definition.scope, definition);
    if (!Array.isArray(definition.cases)) {
      fail(`definition ${definition.scope} cases must be an array`);
    }
    for (const caseDefinition of definition.cases) {
      if (typeof caseDefinition.id !== 'string'
        || !Array.isArray(caseDefinition.covered_clauses)
        || caseDefinition.covered_clauses.length === 0) {
        fail(`case ${definition.scope}/${caseDefinition.id} lacks covered_clauses`);
      }
      const key = referenceKey({
        scope: definition.scope,
        id: caseDefinition.id,
      });
      if (caseIndex.has(key)) fail(`duplicate case ${definition.scope}/${caseDefinition.id}`);
      caseIndex.set(key, { definition, caseDefinition });
    }
  }
  if (definitionIndex.size !== EXPECTED_SCOPE_OWNERS.size) {
    fail('contract coverage definitions are incomplete');
  }

  const clauseIndex = new Map();
  for (const clause of coverage.clauses) {
    if (!clause || typeof clause.id !== 'string'
      || typeof clause.owner !== 'string'
      || !Array.isArray(clause.cases)
      || clause.cases.length === 0) {
      fail('contract coverage clause is invalid');
    }
    const clauseKey = referenceKey({ scope: coverage.scope, id: clause.id });
    if (clauseIndex.has(clauseKey)) fail(`duplicate clause ${clause.id}`);
    clauseIndex.set(clauseKey, clause);
    for (const caseReference of clause.cases) {
      const target = caseIndex.get(referenceKey(caseReference));
      if (!target) {
        fail(`clause ${clause.id} references unknown case`);
      }
      if (target.definition.owner !== clause.owner) {
        fail(`clause ${clause.id} owner does not match referenced definition`);
      }
    }
  }

  for (const [clauseKey, clause] of clauseIndex) {
    for (const caseReference of clause.cases) {
      const { caseDefinition } = caseIndex.get(referenceKey(caseReference));
      const reciprocal = caseDefinition.covered_clauses
        .map(referenceKey)
        .includes(clauseKey);
      if (!reciprocal) {
        fail(`clause ${clause.id} is missing reciprocal clause back-reference`);
      }
    }
  }
  for (const [caseKey, { caseDefinition }] of caseIndex) {
    for (const clauseReference of caseDefinition.covered_clauses) {
      const clause = clauseIndex.get(referenceKey(clauseReference));
      if (!clause) fail(`case ${caseDefinition.id} references unknown clause`);
      const reciprocal = clause.cases.map(referenceKey).includes(caseKey);
      if (!reciprocal) {
        fail(`case ${caseDefinition.id} is missing reciprocal case back-reference`);
      }
    }
  }

  return {
    clauses: clauseIndex.size,
    cases: caseIndex.size,
    definitions: definitionIndex.size,
  };
}

module.exports = {
  ContractCoverageError,
  loadContractModel,
  validateContractCoverage,
};
