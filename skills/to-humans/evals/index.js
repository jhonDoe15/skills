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
    (prose, segment) => prose.split(segment).join(''),
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
    /BEGIN PROTECTED\n([\s\S]*?)\nEND PROTECTED/g,
  )].map((match) => match[1]);
}

function routingChecks(invoked, expectation = {}) {
  const expected = expectation.selected || [];
  const exactMatch = JSON.stringify([...invoked].sort())
    === JSON.stringify([...expected].sort());
  const checks = [
    check(
      'selected routes exactly',
      exactMatch,
      exactMatch
        ? 'matched'
        : `expected=${JSON.stringify(expected)} observed=${JSON.stringify(invoked)}`,
    ),
  ];
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
    ...routingChecks(
      result.observations.routing.invokedSkills,
      caseDefinition.routing_expectation,
    ),
    ...gradeRequiredTerms(output, deterministic.required_terms),
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

function routingObservation(output) {
  try {
    const value = JSON.parse(output);
    if (value?.kind === 'to-humans-routing-observation') return value;
  } catch {
    // Human-facing responses are not expected to be JSON.
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
  return gradeRoutingObservation({
    caseDefinition,
    status: result.status,
    invokedSkills: result.observations.routing.invokedSkills,
    output: outputFrom(result),
  });
}

function gradeRoutingObservation({
  caseDefinition,
  status,
  invokedSkills,
  output,
}) {
  const expectation = caseDefinition.routing_expectation;
  const checks = [
    check(
      'execution succeeded',
      status === 'succeeded',
      `status=${status}`,
    ),
    ...routingChecks(invokedSkills, expectation),
  ];

  if (expectation.deliverables) {
    const observed = routingObservation(output);
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

function gradeRoutingEvidence({ trigger, caseDefinition, evidence }) {
  validateEvaluationDefinition(trigger);
  if (
    !evidence?.execution
    || !evidence.execution.routing
    || evidence.case_id !== caseDefinition.id
  ) {
    throw new TypeError('routing evidence must match the evaluated case');
  }
  return gradeRoutingObservation({
    caseDefinition,
    status: evidence.execution.status,
    invokedSkills: evidence.execution.routing.invoked_skills,
    output: evidence.execution.output,
  });
}

module.exports = {
  gradeHumanWritingResult,
  gradeRoutingEvidence,
  gradeRoutingResult,
  loadDefinitions,
  protectedSegmentsFromPrompt,
};
