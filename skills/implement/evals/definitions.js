'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const { ImplementEvaluationError } = require('./handoff');

const DEFINITION_PATH = path.join(__dirname, 'evals.json');
const LAYERS = ['role', 'component', 'outcome', 'trigger'];
const EXPECTED_POLICY = {
  fresh_sessions: true,
  matched_no_skill: true,
  trigger_separate: true,
  semantic_grade: 'blind-model-with-output-evidence',
  human_review: 'every-failure-and-predeclared-passing-sample',
  generated_artifacts: 'uncommitted',
};

function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
  if (JSON.stringify(catalog.evaluation_policy) !== JSON.stringify(EXPECTED_POLICY)) {
    throw new ImplementEvaluationError('evaluation policy is incomplete');
  }
  return catalog;
}

function definitionForLayer(catalog, layer) {
  let arms = ['no-skill', 'treatment'];
  if (layer === 'component') {
    arms = ['treatment', 'component-ablation'];
  } else if (layer === 'trigger') {
    arms = ['treatment'];
  }
  return {
    skill_name: catalog.skill_name,
    version: catalog.version,
    evaluation: {
      scope: `implement-${layer}`,
      layer,
      skill: catalog.skill_name,
      hosts: [...catalog.hosts],
      arms,
    },
    config: {
      ...catalog.config,
      minimum_treatment_win_rate: layer === 'trigger'
        ? 0
        : catalog.config.minimum_treatment_win_rate,
      randomization_seed: `${catalog.config.randomization_seed}-${layer}`,
    },
    signals: {},
    global_required_signals: [],
    global_order: [],
    forbidden_patterns: [],
    judge: structuredClone(catalog.judge),
    evals: catalog.evals
      .filter((evaluation) => evaluation.layer === layer)
      .map((evaluation) => {
        const normalized = structuredClone(evaluation);
        delete normalized.layer;
        return normalized;
      }),
  };
}

function loadDefinitions(repositoryRoot) {
  const catalog = loadCatalog();
  return LAYERS.map((layer) => {
    const definition = definitionForLayer(catalog, layer);
    validateEvaluationDefinition(definition, repositoryRoot);
    return definition;
  });
}

module.exports = { loadDefinitions };
