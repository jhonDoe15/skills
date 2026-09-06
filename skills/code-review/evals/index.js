'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { validateEvaluationDefinition } = require('../../../suite/evaluation');
const {
  loadContractModel,
  validateContractCoverage,
} = require('./contract-coverage');
const {
  ReviewArtifactError,
  coordinateReview,
  validateReviewRun,
} = require('./review-artifact');
const { gradeCodeReviewResult } = require('./grader');

const DEFINITION_FILES = [
  'role.json',
  'component.json',
  'outcome.json',
  'trigger.json',
];

function loadDefinitions(repositoryRoot) {
  const definitions = DEFINITION_FILES.map((fileName) => {
    const definition = JSON.parse(
      fs.readFileSync(path.join(__dirname, fileName), 'utf8'),
    );
    validateEvaluationDefinition(definition, repositoryRoot);
    return definition;
  });
  validateContractCoverage(loadContractModel(repositoryRoot));
  return definitions;
}

module.exports = {
  ReviewArtifactError,
  coordinateReview,
  gradeCodeReviewResult,
  loadDefinitions,
  validateContractCoverage,
  validateReviewRun,
};
