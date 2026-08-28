'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { validateEvaluationDefinition } = require('../../../suite/evaluation');
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
  return DEFINITION_FILES.map((fileName) => {
    const definition = JSON.parse(
      fs.readFileSync(path.join(__dirname, fileName), 'utf8'),
    );
    validateEvaluationDefinition(definition, repositoryRoot);
    return definition;
  });
}

module.exports = {
  ReviewArtifactError,
  coordinateReview,
  gradeCodeReviewResult,
  loadDefinitions,
  validateReviewRun,
};
