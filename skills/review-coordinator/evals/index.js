'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { validateEvaluationDefinition } = require('../../../suite/evaluation');

const DEFINITION_FILES = ['role.json', 'component.json'];

function loadDefinitions(repositoryRoot) {
  return DEFINITION_FILES.map((fileName) => {
    const definition = JSON.parse(
      fs.readFileSync(path.join(__dirname, fileName), 'utf8'),
    );
    validateEvaluationDefinition(definition, repositoryRoot);
    return definition;
  });
}

module.exports = { loadDefinitions };
