'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const { validateResult } = require('../../../suite');

const DEFINITION_FILES = [
  'role.json',
  'component.json',
  'outcome.json',
  'trigger.json',
];

function loadDefinitions() {
  return DEFINITION_FILES.map((fileName) => {
    const definition = JSON.parse(fs.readFileSync(
      path.join(__dirname, fileName),
      'utf8',
    ));
    return validateEvaluationDefinition(definition);
  });
}

function outputFrom(result) {
  return result.observations.responses
    .map(({ text }) => text)
    .join('\n\n');
}

function check(name, passed, details) {
  return { name, passed, details };
}

function compile(pattern, field) {
  try {
    return new RegExp(pattern, 'im');
  } catch (error) {
    throw new TypeError(`${field} is invalid: ${error.message}`);
  }
}

function removeProtectedSegments(output, protectedSegments) {
  return protectedSegments.reduce(
    (prose, { content }) => prose.split(content).join(''),
    output,
  );
}

function gradeRequiredTerms(output, requiredTerms = []) {
  const normalizedOutput = output.toLocaleLowerCase('en');
  return requiredTerms.map(({ name, term }) => {
    if (typeof name !== 'string' || typeof term !== 'string' || term.length === 0) {
      throw new TypeError('required terms need non-empty names and terms');
    }
    const present = normalizedOutput.includes(term.toLocaleLowerCase('en'));
    return check(name, present, present ? 'present' : 'missing');
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

function matchesAny(value, patterns, field) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new TypeError(`${field} must be a non-empty pattern array`);
  }
  return patterns.some((pattern, index) => (
    compile(pattern, `${field}[${index}]`).test(value)
  ));
}

function firstNonemptyBlock(output) {
  return output.trimStart().split(/\r?\n\s*\r?\n/, 1)[0] || '';
}

function wordCount(value) {
  return value.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function contentUnits(output) {
  return output
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function gradeAnswerFirst(output, expectation) {
  if (!expectation) return [];
  const firstBlock = firstNonemptyBlock(output);
  const topic = matchesAny(
    firstBlock,
    expectation.topic_patterns,
    'answer_first.topic_patterns',
  );
  const answer = matchesAny(
    firstBlock,
    expectation.answer_patterns,
    'answer_first.answer_patterns',
  );
  return [check(
    'answer first',
    topic && answer,
    topic && answer
      ? 'scenario answer appears in the first block'
      : 'first block lacks the scenario topic or a concrete answer',
  )];
}

function gradeAccountableActions(output, expectations = []) {
  if (!Array.isArray(expectations)) {
    throw new TypeError('accountable_actions must be an array');
  }
  const lines = output.split(/\r?\n/);
  const usedLines = new Set();
  return expectations.map((expectation, index) => {
    if (!expectation || typeof expectation.name !== 'string') {
      throw new TypeError(`accountable_actions[${index}] needs a name`);
    }
    const minimumWords = expectation.minimum_words || 4;
    const lineIndex = lines.findIndex((line, candidateIndex) => (
      !usedLines.has(candidateIndex)
      && wordCount(line) >= minimumWords
      && matchesAny(
        line,
        expectation.owner_patterns,
        `accountable_actions[${index}].owner_patterns`,
      )
      && matchesAny(
        line,
        expectation.action_patterns,
        `accountable_actions[${index}].action_patterns`,
      )
    ));
    if (lineIndex !== -1) usedLines.add(lineIndex);
    return check(
      `accountable action ${expectation.name}`,
      lineIndex !== -1,
      lineIndex === -1
        ? 'no distinct owner-and-action line found'
        : `line ${lineIndex + 1}`,
    );
  });
}

function gradeDecisionSupport(output, expectation) {
  if (!expectation) return [];
  const units = contentUnits(output);
  return [
    ['recommendation', 'decision recommendation', 5],
    ['basis', 'decision basis', 6],
    ['material_uncertainty', 'decision material uncertainty', 4],
    ['change_condition', 'decision change condition', 8],
  ].map(([field, name, minimumWords]) => {
    const groups = expectation[field];
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new TypeError(`decision_support.${field} must contain pattern groups`);
    }
    const unitIndex = units.findIndex((unit) => (
      wordCount(unit) >= minimumWords
      && groups.every((patterns, index) => matchesAny(
        unit,
        patterns,
        `decision_support.${field}[${index}]`,
      ))
    ));
    return check(
      name,
      unitIndex !== -1,
      unitIndex === -1
        ? `no ${minimumWords}-word scenario-grounded statement`
        : `statement ${unitIndex + 1}`,
    );
  });
}

function gradeProtectedSegments(output, protectedSegments, categories = []) {
  if (!Array.isArray(categories)) {
    throw new TypeError('protected_categories must be an array');
  }
  return categories.map((category, index) => {
    if (typeof category !== 'string' || category.length === 0) {
      throw new TypeError(`protected_categories[${index}] must be non-empty`);
    }
    const segments = protectedSegments.filter((segment) => (
      segment.category === category
    ));
    const preserved = segments.length > 0
      && segments.every(({ content }) => output.includes(content));
    return check(
      `protected ${category} unchanged`,
      preserved,
      preserved
        ? `${segments.length} segment(s) preserved byte-for-byte`
        : 'missing category or changed content',
    );
  });
}

function gradeHumanWritingResult({
  evaluationDefinition,
  caseDefinition,
  result,
}) {
  validateEvaluationDefinition(evaluationDefinition);
  validateResult(result);
  const output = outputFrom(result);
  const deterministic = caseDefinition.deterministic || {};
  const protectedSegments = protectedSegmentsFromPrompt(caseDefinition.prompt);
  const prose = removeProtectedSegments(output, protectedSegments);
  const checks = [
    check(
      'execution succeeded',
      result.status === 'succeeded',
      `status=${result.status}`,
    ),
    ...gradeRequiredTerms(output, deterministic.required_terms),
    ...gradeAnswerFirst(output, deterministic.answer_first),
    ...gradeAccountableActions(
      output,
      deterministic.accountable_actions,
    ),
    ...gradeDecisionSupport(output, deterministic.decision_support),
    ...gradeProtectedSegments(
      output,
      protectedSegments,
      deterministic.protected_categories,
    ),
    ...(deterministic.forbidden_patterns || []).map((pattern, index) => {
      const matched = compile(
        pattern,
        `forbidden_patterns[${index}]`,
      ).test(prose);
      return check(
        `forbidden prose pattern ${index + 1}`,
        !matched,
        matched ? 'matched' : 'not found',
      );
    }),
  ];
  if (deterministic.minimum_nonempty_lines) {
    const lineCount = output.split('\n').filter((line) => line.trim()).length;
    const enoughLines = lineCount >= deterministic.minimum_nonempty_lines;
    checks.push(check(
      'minimum nonempty lines',
      enoughLines,
      `minimum=${deterministic.minimum_nonempty_lines} observed=${lineCount}`,
    ));
  }
  if (deterministic.no_em_dash) {
    const hasEmDash = prose.includes('\u2014');
    checks.push(check(
      'no em dash in prose',
      !hasEmDash,
      hasEmDash ? 'found em dash' : 'not found',
    ));
  }
  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = {
  gradeHumanWritingResult,
  loadDefinitions,
  protectedSegmentsFromPrompt,
};
