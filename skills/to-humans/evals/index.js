'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  gradeDeterministicOutput,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const DEFINITION_FILES = [
  'role.json',
  'component.json',
  'outcome.json',
  'trigger.json',
];
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadDefinitions(repositoryRoot = REPOSITORY_ROOT) {
  return DEFINITION_FILES.map((fileName) => {
    const evaluationDefinition = JSON.parse(fs.readFileSync(
      path.join(__dirname, fileName),
      'utf8',
    ));
    validateEvaluationDefinition(evaluationDefinition, repositoryRoot);
    evaluationDefinition.evals.forEach(validateMechanicalCase);
    return evaluationDefinition;
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

function validateMechanicalCase(caseDefinition) {
  if (caseDefinition.no_em_dash !== undefined
      && typeof caseDefinition.no_em_dash !== 'boolean') {
    throw new TypeError('no_em_dash must be a boolean');
  }
  const declared = caseDefinition.protected_segments;
  if (declared === undefined) return;
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new TypeError('protected_segments must be a non-empty array');
  }
  const promptSegments = protectedSegmentsFromPrompt(caseDefinition.prompt);
  const normalized = declared.map((segment, index) => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
      throw new TypeError(`protected_segments[${index}] must be an object`);
    }
    if (typeof segment.category !== 'string' || segment.category.length === 0
        || typeof segment.content !== 'string' || segment.content.length === 0
        || !Number.isInteger(segment.occurrence_count)
        || segment.occurrence_count < 1) {
      throw new TypeError(
        `protected_segments[${index}] needs category, content, and occurrence_count`,
      );
    }
    return {
      category: segment.category,
      content: segment.content,
    };
  });
  if (JSON.stringify(normalized) !== JSON.stringify(promptSegments)) {
    throw new TypeError('protected_segments must exactly match prompt fixtures');
  }
}

function exactByteOffsets(haystack, needle) {
  const offsets = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const offset = haystack.indexOf(needle, cursor);
    if (offset === -1) break;
    offsets.push(offset);
    cursor = offset + needle.length;
  }
  return offsets;
}

function gradeProtectedSegments(output, declarations = []) {
  const outputBytes = Buffer.from(output, 'utf8');
  const spans = [];
  const checks = declarations.map((segment) => {
    const contentBytes = Buffer.from(segment.content, 'utf8');
    const offsets = exactByteOffsets(outputBytes, contentBytes);
    offsets.forEach((start) => spans.push({
      category: segment.category,
      end: start + contentBytes.length,
      start,
    }));
    return {
      name: `protected ${segment.category} byte fidelity`,
      passed: offsets.length === segment.occurrence_count,
      details: `expected=${segment.occurrence_count} observed=${offsets.length}`,
    };
  });
  if (declarations.length > 1) {
    const firstOffsets = declarations.map((segment) => {
      const contentBytes = Buffer.from(segment.content, 'utf8');
      return outputBytes.indexOf(contentBytes);
    });
    const ordered = firstOffsets.every((offset, index) => (
      offset !== -1 && (index === 0 || offset > firstOffsets[index - 1])
    ));
    checks.push({
      name: 'protected segment order',
      passed: ordered,
      details: ordered ? 'matches declaration order' : 'order changed',
    });
  }
  return { checks, spans };
}

function proseWithoutProtectedSpans(output, spans) {
  const bytes = Buffer.from(output, 'utf8');
  spans.forEach(({ start, end }) => bytes.fill(0x20, start, end));
  return bytes.toString('utf8');
}

function gradeMechanicalOutput({
  evaluationDefinition,
  caseDefinition,
  output,
}) {
  validateMechanicalCase(caseDefinition);
  const shared = gradeDeterministicOutput({
    definition: evaluationDefinition,
    caseDefinition,
    output,
  });
  const protectedGrade = gradeProtectedSegments(
    output,
    caseDefinition.protected_segments,
  );
  const checks = [...shared.checks, ...protectedGrade.checks];
  if (caseDefinition.no_em_dash === true) {
    const prose = proseWithoutProtectedSpans(output, protectedGrade.spans);
    const found = prose.includes('\u2014');
    checks.push({
      name: 'no em dash in prose',
      passed: !found,
      details: found ? 'found outside protected spans' : 'not found',
    });
  }
  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = {
  gradeMechanicalOutput,
  loadDefinitions,
  protectedSegmentsFromPrompt,
};
