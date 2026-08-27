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

function contentUnits(output) {
  return output
    .split(/\r?\n/)
    .flatMap((line) => line.split(
      /(?<=[.!?;])\s+|,\s+(?=(?:but|while|although)\b)|\s+(?=(?:because|since|but|while|although)\b)/i,
    ))
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function normalizedTokens(value) {
  return value.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) || [];
}

const STRUCTURE_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'because', 'but', 'by', 'for', 'from',
  'has', 'have', 'if', 'in', 'is', 'it', 'of', 'on', 'only', 'or', 'since',
  'that', 'the', 'this', 'to', 'was', 'were', 'when', 'while', 'with',
]);

function normalizedUnit(value) {
  return normalizedTokens(value).join(' ');
}

function isRepetitive(value) {
  const tokens = normalizedTokens(value);
  if (tokens.some((token, index) => index > 0 && token === tokens[index - 1])) {
    return true;
  }
  const contentTokens = tokens.filter((token) => !STRUCTURE_WORDS.has(token));
  const pairs = new Set();
  for (let index = 0; index + 1 < contentTokens.length; index += 1) {
    const pair = `${contentTokens[index]}\0${contentTokens[index + 1]}`;
    if (pairs.has(pair)) return true;
    pairs.add(pair);
  }
  return false;
}

function evidenceUnits(output) {
  const units = contentUnits(output);
  const counts = new Map();
  for (const unit of units) {
    const key = normalizedUnit(unit);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return units.map((unit, index) => {
    const key = normalizedUnit(unit);
    return {
      index,
      key,
      text: unit,
      unique: key.length > 0 && counts.get(key) === 1,
      meaningful: key.length > 0 && !isRepetitive(unit),
    };
  });
}

function matchingText(value, patterns, field) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new TypeError(`${field} must be a non-empty pattern array`);
  }
  for (const [index, pattern] of patterns.entries()) {
    const match = compile(pattern, `${field}[${index}]`).exec(value);
    if (match) return match[0].toLocaleLowerCase('en');
  }
  return null;
}

function matchesOrderedGroups(value, groups, field) {
  if (!Array.isArray(groups) || groups.length < 2) {
    throw new TypeError(`${field} must contain at least two pattern groups`);
  }
  let cursor = 0;
  return groups.every((patterns, groupIndex) => {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      throw new TypeError(`${field}[${groupIndex}] must be a non-empty pattern array`);
    }
    let earliest = null;
    for (const [patternIndex, pattern] of patterns.entries()) {
      const match = compile(
        pattern,
        `${field}[${groupIndex}][${patternIndex}]`,
      ).exec(value.slice(cursor));
      if (match && (!earliest || match.index < earliest.index)) earliest = match;
    }
    if (!earliest) return false;
    cursor += earliest.index + earliest[0].length;
    return true;
  });
}

function matchesProposition(value, proposition, field) {
  if (!proposition || typeof proposition !== 'object' || Array.isArray(proposition)) {
    throw new TypeError(`${field} must be an object`);
  }
  const requiredGroups = proposition.required_groups;
  const orderedGroups = proposition.ordered_groups;
  if (!Array.isArray(requiredGroups) || requiredGroups.length === 0) {
    throw new TypeError(`${field}.required_groups must contain pattern groups`);
  }
  if (!Array.isArray(orderedGroups) || orderedGroups.length === 0) {
    throw new TypeError(`${field}.ordered_groups must contain relationship alternatives`);
  }
  return requiredGroups.every((patterns, index) => (
    matchesAny(value, patterns, `${field}.required_groups[${index}]`)
  )) && orderedGroups.some((groups, index) => (
    matchesOrderedGroups(value, groups, `${field}.ordered_groups[${index}]`)
  ));
}

function gradeAnswerFirst(output, expectation) {
  if (!expectation) return [];
  const firstUnit = evidenceUnits(output)[0];
  const topic = matchesAny(
    firstUnit?.text || '',
    expectation.topic_patterns,
    'answer_first.topic_patterns',
  );
  const answer = matchesAny(
    firstUnit?.text || '',
    expectation.answer_patterns,
    'answer_first.answer_patterns',
  );
  const substantive = firstUnit?.meaningful === true;
  return [check(
    'answer first',
    topic && answer && substantive,
    topic && answer && substantive
      ? 'scenario answer appears in the first statement'
      : 'first statement lacks a substantive scenario answer',
  )];
}

function gradeAccountableActions(output, expectations = []) {
  if (!Array.isArray(expectations)) {
    throw new TypeError('accountable_actions must be an array');
  }
  const units = evidenceUnits(output);
  const usedUnits = new Set();
  const usedPairs = new Set();
  return expectations.map((expectation, index) => {
    if (!expectation || typeof expectation.name !== 'string') {
      throw new TypeError(`accountable_actions[${index}] needs a name`);
    }
    const candidate = units.find((unit) => {
      if (!unit.unique || !unit.meaningful || usedUnits.has(unit.key)) {
        return false;
      }
      const owner = matchingText(
        unit.text,
        expectation.owner_patterns,
        `accountable_actions[${index}].owner_patterns`,
      );
      const action = matchingText(
        unit.text,
        expectation.action_patterns,
        `accountable_actions[${index}].action_patterns`,
      );
      const source = matchingText(
        unit.text,
        expectation.source_patterns,
        `accountable_actions[${index}].source_patterns`,
      );
      const qualifier = matchingText(
        unit.text,
        expectation.qualifier_patterns,
        `accountable_actions[${index}].qualifier_patterns`,
      );
      const ownerCount = expectations.filter((other, otherIndex) => (
        matchesAny(
          unit.text,
          other.owner_patterns,
          `accountable_actions[${otherIndex}].owner_patterns`,
        )
      )).length;
      const conflictingSource = expectations.some((other, otherIndex) => (
        otherIndex !== index
        && matchesAny(
          unit.text,
          other.source_patterns,
          `accountable_actions[${otherIndex}].source_patterns`,
        )
      ));
      if (!Array.isArray(expectation.relationship_orders)
          || expectation.relationship_orders.length === 0) {
        throw new TypeError(
          `accountable_actions[${index}].relationship_orders must be non-empty`,
        );
      }
      const relationship = expectation.relationship_orders.some((order, orderIndex) => {
        if (!Array.isArray(order)) {
          throw new TypeError(
            `accountable_actions[${index}].relationship_orders[${orderIndex}] must be an array`,
          );
        }
        const groups = order.map((part) => {
          const patterns = expectation[`${part}_patterns`];
          if (!patterns) {
            throw new TypeError(
              `accountable_actions[${index}] has no ${part}_patterns`,
            );
          }
          return patterns;
        });
        return matchesOrderedGroups(
          unit.text,
          groups,
          `accountable_actions[${index}].relationship_orders[${orderIndex}]`,
        );
      });
      const pair = owner && action ? `${owner}\0${action}` : null;
      if (!owner || !action || !source || !qualifier || !relationship
          || conflictingSource || ownerCount !== 1 || usedPairs.has(pair)) {
        return false;
      }
      unit.pair = pair;
      return true;
    });
    if (candidate) {
      usedUnits.add(candidate.key);
      usedPairs.add(candidate.pair);
    }
    return check(
      `accountable action ${expectation.name}`,
      Boolean(candidate),
      candidate
        ? `statement ${candidate.index + 1}`
        : 'no distinct source-grounded owner-action relationship found',
    );
  });
}

function gradeDecisionSupport(output, expectation) {
  if (!expectation) return [];
  const units = evidenceUnits(output);
  const usedUnits = new Set();
  return [
    ['recommendation', 'decision recommendation'],
    ['basis', 'decision basis'],
    ['material_uncertainty', 'decision material uncertainty'],
    ['change_condition', 'decision change condition'],
  ].map(([field, name]) => {
    const proposition = expectation[field];
    const unit = units.find((candidate) => (
      candidate.unique
      && candidate.meaningful
      && !usedUnits.has(candidate.key)
      && matchesProposition(
        candidate.text,
        proposition,
        `decision_support.${field}`,
      )
    ));
    if (unit) usedUnits.add(unit.key);
    return check(
      name,
      Boolean(unit),
      unit
        ? `statement ${unit.index + 1}`
        : 'no distinct scenario-grounded statement',
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
