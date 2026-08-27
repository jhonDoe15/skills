'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const DEFINITION_FILES = [
  'role.json',
  'component.json',
  'outcome.json',
  'trigger.json',
];

function loadDefinitions() {
  return DEFINITION_FILES.map((fileName) => {
    const evaluationDefinition = JSON.parse(fs.readFileSync(
      path.join(__dirname, fileName),
      'utf8',
    ));
    return validateEvaluationDefinition(evaluationDefinition);
  });
}

function protectedSegmentsFromPrompt(prompt) {
  if (typeof prompt !== 'string') {
    throw new TypeError('evaluation prompt must be a string');
  }
  return [...prompt.matchAll(
    /BEGIN PROTECTED ([A-Z]+)\r?\n([\s\S]*?)\r?\nEND PROTECTED \1/g,
  )].map((match) => ({
    category: match[1].toLocaleLowerCase('en'),
    content: match[2],
  }));
}

module.exports = {
  loadDefinitions,
  protectedSegmentsFromPrompt,
};
