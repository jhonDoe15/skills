'use strict';

const {
  gradeDeterministicOutput,
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

function invokedSkillsDetails(invokedSkills) {
  return `invoked=${invokedSkills.join(',') || 'none'}`;
}

function gradeTakeItOfflineRouting({ caseDefinition, result }) {
  validateResult(result);
  const invokedSkills = result.observations.routing.invokedSkills;
  const primaryInvoked = invokedSkills.includes('take-it-offline');
  const toHumansInvoked = invokedSkills.includes('to-humans');
  const shouldTrigger = caseDefinition.should_trigger === true;
  const details = invokedSkillsDetails(invokedSkills);
  const checks = [
    check(
      'exact take-it-offline membership',
      primaryInvoked === shouldTrigger,
      `expected=${shouldTrigger} ${details}`,
    ),
    check(
      'to-humans remains inactive for continuation',
      !shouldTrigger || !toHumansInvoked,
      details,
    ),
  ];
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
  const invokedSkills = result.observations.routing.invokedSkills;

  checks.push(check(
    'canonical primary and dependency routing',
    invokedSkills.includes('take-it-offline')
      && invokedSkills.includes('agent-writing')
      && !invokedSkills.includes('to-humans'),
    invokedSkillsDetails(invokedSkills),
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
