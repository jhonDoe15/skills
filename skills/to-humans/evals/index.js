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

function gradePatterns(output, groups = []) {
  return groups.map(({ name, patterns }) => {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      throw new TypeError(`deterministic pattern group "${name}" is empty`);
    }
    const passed = patterns.some((pattern, index) => (
      compile(pattern, `${name}[${index}]`).test(output)
    ));
    return check(name, passed, passed ? 'matched' : 'not found');
  });
}

function removeProtectedSegments(output, protectedSegments) {
  return protectedSegments.reduce(
    (prose, segment) => prose.split(segment).join(''),
    output,
  );
}

function routingChecks(result, expectation = {}) {
  const invoked = result.observations.routing.invokedSkills;
  const checks = [];
  for (const skill of expectation.selected || []) {
    const selected = invoked.includes(skill);
    checks.push(check(
      `selected route ${skill}`,
      selected,
      selected ? 'selected' : 'not selected',
    ));
  }
  for (const skill of expectation.excluded || []) {
    const selected = invoked.includes(skill);
    checks.push(check(
      `excluded route ${skill}`,
      !selected,
      selected ? 'selected' : 'not selected',
    ));
  }
  return checks;
}

function gradeHumanWritingResult({ role, caseDefinition, result }) {
  validateEvaluationDefinition(role);
  validateResult(result);
  const output = outputFrom(result);
  const deterministic = caseDefinition.deterministic || {};
  const protectedSegments = caseDefinition.protected_segments || [];
  const prose = removeProtectedSegments(output, protectedSegments);
  const checks = [
    check(
      'execution succeeded',
      result.status === 'succeeded',
      `status=${result.status}`,
    ),
    ...routingChecks(result, caseDefinition.routing_expectation),
    ...gradePatterns(output, deterministic.required_pattern_groups),
    ...protectedSegments.map((segment, index) => {
      const preserved = output.includes(segment);
      return check(
        `protected segment ${index + 1} unchanged`,
        preserved,
        preserved ? 'preserved' : 'changed or missing',
      );
    }),
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

function routingObservation(result) {
  for (const { text } of result.observations.responses) {
    try {
      const value = JSON.parse(text);
      if (value?.kind === 'to-humans-routing-observation') return value;
    } catch {
      // Human-facing responses are not expected to be JSON.
    }
  }
  return null;
}

function normalizeDeliverables(deliverables) {
  if (!Array.isArray(deliverables)) return null;
  if (deliverables.some((deliverable) => (
    !deliverable
    || typeof deliverable.id !== 'string'
    || typeof deliverable.primary_reader !== 'string'
    || !Array.isArray(deliverable.outcomes)
    || deliverable.outcomes.some((outcome) => typeof outcome !== 'string')
  ))) {
    return null;
  }
  return [...deliverables]
    .map(({ id, primary_reader: primaryReader, outcomes }) => ({
      id,
      primary_reader: primaryReader,
      outcomes: [...outcomes].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function gradeRoutingResult({ trigger, caseDefinition, result }) {
  validateEvaluationDefinition(trigger);
  validateResult(result);
  const expectation = caseDefinition.routing_expectation;
  const checks = [
    check(
      'execution succeeded',
      result.status === 'succeeded',
      `status=${result.status}`,
    ),
    ...routingChecks(result, expectation),
  ];

  if (expectation.deliverables) {
    const observed = routingObservation(result);
    const observedDeliverables = normalizeDeliverables(observed?.deliverables);
    const expectedDeliverables = normalizeDeliverables(expectation.deliverables);
    const deliverablesMatch = Boolean(observedDeliverables)
      && JSON.stringify(observedDeliverables)
        === JSON.stringify(expectedDeliverables);
    checks.push(check(
      'deliverables routed independently',
      deliverablesMatch,
      deliverablesMatch ? 'matched' : 'missing or mismatched routing observation',
    ));
  }
  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = {
  gradeHumanWritingResult,
  gradeRoutingResult,
  loadDefinitions,
};
