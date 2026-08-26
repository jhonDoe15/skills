'use strict';

const {
  gradeDeterministicOutput,
} = require('../../../suite/evaluation');
const { validateResult } = require('../../../suite');

function check(name, passed, details) {
  return { name, passed, details };
}

function outputFromResult(result) {
  return result.observations.responses
    .map(({ text }) => text)
    .join('\n\n');
}

function sectionBody(markdown, heading) {
  const pattern = new RegExp(
    `^\\s*#{1,6}\\s+${heading}\\s*$`,
    'im',
  );
  const match = pattern.exec(markdown);
  if (!match) return '';
  const remainder = markdown.slice(match.index + match[0].length);
  const nextHeading = /^\s*#{1,6}\s+/m.exec(remainder);
  return nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
}

function verifiedReferences(markdown) {
  const body = sectionBody(markdown, 'Verified artifact references');
  return [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]);
}

function gradeTakeItOfflineResult({
  definition,
  caseDefinition,
  result,
  resolveReference = () => false,
}) {
  validateResult(result);
  const output = outputFromResult(result);
  const deterministic = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output,
  });
  const checks = [...deterministic.checks];
  const invoked = result.observations.routing.invokedSkills;

  checks.push(check(
    'canonical primary and dependency routing',
    invoked.includes('take-it-offline')
      && invoked.includes('agent-writing')
      && !invoked.includes('to-humans'),
    `invoked=${invoked.join(',') || 'none'}`,
  ));

  const continuationArtifacts = result.observations.artifacts;
  const artifactAvailable = continuationArtifacts.length === 1
    && resolveReference(continuationArtifacts[0].reference);
  checks.push(check(
    'one available continuation artifact',
    artifactAvailable,
    artifactAvailable
      ? continuationArtifacts[0].reference
      : `count=${continuationArtifacts.length}`,
  ));

  const references = verifiedReferences(output);
  const unresolved = references.filter((reference) => !resolveReference(reference));
  const referencesRequired = caseDefinition.requires_verified_references === true;
  const referencesPass = unresolved.length === 0
    && (!referencesRequired || references.length > 0);
  checks.push(check(
    'verified artifact references resolve',
    referencesPass,
    unresolved.length > 0
      ? `unresolved=${unresolved.join(',')}`
      : `resolved=${references.length}`,
  ));

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = {
  gradeTakeItOfflineResult,
};
