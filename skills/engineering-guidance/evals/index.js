'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const {
  gradeEngineeringGuidanceResult,
} = require('./grader');

const definitionFiles = ['role.json', 'outcome.json', 'trigger.json'];
const defaultRepositoryRoot = path.resolve(__dirname, '..', '..', '..');

function loadDefinitions(repositoryRoot = defaultRepositoryRoot) {
  return definitionFiles.map((fileName) => {
    const definition = JSON.parse(fs.readFileSync(
      path.join(__dirname, fileName),
      'utf8',
    ));
    validateEvaluationDefinition(definition, repositoryRoot);
    return definition;
  });
}

module.exports = {
  gradeEngineeringGuidanceResult,
  loadDefinitions,
};
