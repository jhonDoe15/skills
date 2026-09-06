'use strict';

const {
  gradeDeterministicOutput,
  gradeTriggerResult,
} = require('../../../suite/evaluation');
const { validateResult } = require('../../../suite');

function check(name, passed, details) {
  return { name, passed, details };
}

function responseTextFromResult(result) {
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

function skillWasAttempted(skillEvents, name) {
  return skillEvents.some((event) => (
    event.name === name && ['select', 'load'].includes(event.operation)
  ));
}

function skillWasLoaded(skillEvents, name) {
  return skillEvents.some((event) => (
    event.name === name
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
}

function skillEventDetails(skillEvents) {
  const eventDetails = skillEvents.map(({ name, operation, status }) => (
    `${name}:${operation}:${status}`
  ));
  return `events=${eventDetails.join(',') || 'none'}`;
}

function gradeTakeItOfflineRouting({ definition, caseDefinition, result }) {
  const triggerGrade = gradeTriggerResult({ definition, caseDefinition, result });
  const skillEvents = result.observations.skillEvents;
  const checks = [...triggerGrade.checks];
  if (caseDefinition.should_trigger) {
    checks.push(check(
      'to-humans remains inactive for continuation',
      !skillWasAttempted(skillEvents, 'to-humans'),
      skillEventDetails(skillEvents),
    ));
  }
  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

function gradeTakeItOfflineResult({
  definition,
  caseDefinition,
  result,
  resolveArtifact = () => null,
  resolveReference = () => false,
}) {
  validateResult(result);
  const response = responseTextFromResult(result);
  const continuationArtifacts = result.observations.artifacts;
  const artifact = continuationArtifacts.length === 1
    ? continuationArtifacts[0]
    : null;
  const artifactIsMarkdown = artifact?.mediaType === 'text/markdown';
  const continuationMarkdown = artifactIsMarkdown
    ? resolveArtifact(artifact.reference)
    : null;
  const artifactIsReadable = typeof continuationMarkdown === 'string';
  const hasReadableMarkdownArtifact = artifact !== null
    && artifactIsMarkdown
    && artifactIsReadable;
  const deterministic = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output: artifactIsReadable ? continuationMarkdown : '',
  });
  const checks = [...deterministic.checks];
  const skillEvents = result.observations.skillEvents;

  checks.push(check(
    'canonical primary and dependency routing',
    skillWasLoaded(skillEvents, 'take-it-offline')
      && skillWasLoaded(skillEvents, 'agent-writing')
      && !skillWasAttempted(skillEvents, 'to-humans'),
    skillEventDetails(skillEvents),
  ));

  checks.push(check(
    'one readable Markdown continuation artifact',
    hasReadableMarkdownArtifact,
    artifact
      ? `count=1 mediaType=${artifact.mediaType} readable=${artifactIsReadable}`
      : `count=${continuationArtifacts.length}`,
  ));

  const responseReferencesArtifact = artifact !== null
    && response.includes(artifact.reference);
  checks.push(check(
    'response references continuation artifact',
    responseReferencesArtifact,
    responseReferencesArtifact
      ? artifact.reference
      : 'artifact reference absent from response',
  ));

  const references = artifactIsReadable
    ? verifiedReferences(continuationMarkdown)
    : [];
  const unresolved = references.filter((reference) => !resolveReference(reference));
  const referencesRequired = caseDefinition.requires_verified_references === true;
  const hasRequiredReferences = !referencesRequired || references.length > 0;
  const referencesPass = unresolved.length === 0 && hasRequiredReferences;
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
  gradeTakeItOfflineRouting,
};
