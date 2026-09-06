'use strict';

const OPEN_MARKER = '<!-- implementation-blueprint:v1 -->';
const CLOSE_MARKER = '<!-- /implementation-blueprint -->';
const REQUIRED_SECTIONS = Object.freeze([
  'Outcome and scope',
  'Evidence and uncertainty',
  'Technical design plan',
  'TDD test plan',
  'Review record',
  'Implementation start',
  'Blockers',
]);
const REQUIRED_REVIEWERS = Object.freeze([
  'Spec',
  'Standards',
  'Architecture dynamic behavior',
  'Architecture static structure',
  'Uncle Bob/Clean Architecture',
  'John Ousterhout/APOSD',
]);
const PUBLICATION_ONLY_NOTE_PATTERNS = Object.freeze([
  /^- Ticket publication(?: write)? (?:is|was|remains) (?:prohibited|unavailable)\.?$/i,
  /^- Ticket publication(?: write)? requires explicit write authorization\.?$/i,
]);
const CONDITIONAL_GATE_PATTERN = /\b(?:after|blocked|if|once|pending|unless|until|when)\b|(?:contingent|dependent|subject) (?:on|to|upon)|\bprovided that\b/i;

class BlueprintContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlueprintContractError';
  }
}

function occurrenceCount(source, value) {
  return source.split(value).length - 1;
}

function extractMarkedBlock(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new BlueprintContractError('blueprint source must be non-empty text');
  }
  if (occurrenceCount(source, OPEN_MARKER) !== 1) {
    throw new BlueprintContractError(
      'blueprint must contain exactly one opening marker',
    );
  }
  if (occurrenceCount(source, CLOSE_MARKER) !== 1) {
    throw new BlueprintContractError(
      'blueprint must contain exactly one closing marker',
    );
  }
  const start = source.indexOf(OPEN_MARKER);
  const end = source.indexOf(CLOSE_MARKER);
  if (end <= start) {
    throw new BlueprintContractError('blueprint closing marker is out of order');
  }
  return source.slice(start + OPEN_MARKER.length, end).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function field(block, name) {
  const match = block.match(new RegExp(
    `^- ${escapeRegExp(name)}:\\s*(.+?)\\s*$`,
    'm',
  ));
  if (!match || match[1].includes('[')) {
    throw new BlueprintContractError(
      `blueprint field "${name}" must have one concrete value`,
    );
  }
  return match[1];
}

function headingCount(block, level, name) {
  const matches = block.match(new RegExp(
    `^${'#'.repeat(level)} ${escapeRegExp(name)}\\s*$`,
    'gm',
  ));
  return matches?.length || 0;
}

function section(block, level, name) {
  const heading = `${'#'.repeat(level)} ${name}`;
  const start = block.indexOf(heading);
  if (start === -1) {
    throw new BlueprintContractError(`blueprint is missing "${name}" section`);
  }
  const contentStart = start + heading.length;
  const nextHeading = new RegExp(`^#{1,${level}}\\s`, 'gm');
  nextHeading.lastIndex = contentStart;
  const next = nextHeading.exec(block);
  return block.slice(contentStart, next?.index ?? block.length).trim();
}

function requireSections(block) {
  for (const name of REQUIRED_SECTIONS) {
    if (headingCount(block, 2, name) !== 1) {
      throw new BlueprintContractError(
        `blueprint must contain exactly one "${name}" section`,
      );
    }
  }
}

function declaredIds(block) {
  const regression = section(block, 3, 'Regression and build gates');
  const declarations = block
    .replace(`### Regression and build gates\n${regression}`, '')
    .matchAll(/^(?:-\s+|\d+\.\s+)([A-Z]+[0-9]+)\s+—/gm);
  const ids = new Set();
  for (const match of declarations) {
    if (ids.has(match[1])) {
      throw new BlueprintContractError(
        `blueprint contains duplicate declared ID "${match[1]}"`,
      );
    }
    ids.add(match[1]);
  }
  return ids;
}

function idsInSection(block, heading, prefix, ordered = false) {
  const body = section(block, 3, heading);
  const marker = ordered ? '\\d+\\.' : '-';
  return [...body.matchAll(new RegExp(
    `^${marker}\\s+(${prefix}[0-9]+)\\s+—`,
    'gm',
  ))].map((match) => match[1]);
}

function requireNonEmpty(values, label) {
  if (values.length === 0) {
    throw new BlueprintContractError(`blueprint must declare at least one ${label}`);
  }
}

function requireKnownReferences(body, pattern, known, label) {
  for (const match of body.matchAll(pattern)) {
    if (!known.has(match[1])) {
      throw new BlueprintContractError(
        `blueprint references unknown ${label} "${match[1]}"`,
      );
    }
  }
}

function isEvidenceBearingPass(result) {
  return /^PASS\b.+\S$/.test(result);
}

function isConcreteFinding(result) {
  const findingId = result.match(
    /\bF(?:[0-9]|-[A-Za-z0-9])[A-Za-z0-9-]*\b/,
  );
  if (findingId) {
    return result.slice(findingId.index + findingId[0].length).trim().length > 0;
  }
  return /^findings?\s*(?::|—|-)\s*\S/i.test(result);
}

function requireReviews(block, heading, requirePass) {
  const body = section(block, 3, heading);
  for (const reviewer of REQUIRED_REVIEWERS) {
    const match = body.match(
      new RegExp(`^- ${escapeRegExp(reviewer)}:[ \\t]+([^\\n]+)$`, 'm'),
    );
    const result = match?.[1].trim();
    const unlinkedResult = result?.replace(/\[[^\]\n]+\]\([^)]+\)/g, '');
    const hasPlaceholder = unlinkedResult?.includes('[')
      || unlinkedResult?.includes(']');
    const validResult = result
      && !hasPlaceholder
      && (
        isEvidenceBearingPass(result)
        || (!requirePass && isConcreteFinding(result))
      );
    if (!validResult) {
      throw new BlueprintContractError(
        `${heading} is missing an evidence-bearing result for ${reviewer}`,
      );
    }
  }
}

function isNoImplementationBlockerDeclaration(line) {
  return /^- None(?: for technical (?:planning|design))?\.?$/i.test(line);
}

function isPublicationOnlyNote(line, implementationTicket) {
  if (PUBLICATION_ONLY_NOTE_PATTERNS.some((pattern) => pattern.test(line))) {
    return true;
  }
  const target = /^- Publication is intentionally unavailable: this block was not written to `([^`]+)` because repository edits were prohibited\.$/
    .exec(line)?.[1];
  return target === implementationTicket;
}

function requireNoImplementationBlockers(block, implementationTicket) {
  const blockerEntries = section(block, 2, 'Blockers')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const declaresNone = blockerEntries.some(
    isNoImplementationBlockerDeclaration,
  );
  const hasUnsupportedEntry = blockerEntries.some((line) => (
    !isNoImplementationBlockerDeclaration(line)
      && !isPublicationOnlyNote(line, implementationTicket)
  ));
  if (!declaresNone || hasUnsupportedEntry) {
    throw new BlueprintContractError(
      'ready blueprint must declare no implementation blockers',
    );
  }
}

function parseBase(value, label) {
  const match = value.match(/`?([a-f0-9]{40})`?/);
  if (!match) {
    throw new BlueprintContractError(`${label} must contain one 40-hex revision`);
  }
  return match[1];
}

function implementationTicketIdentity(value) {
  return /`([^`]+)`/.exec(value)?.[1]
    || value.split(/\s+\(/, 1)[0].trim();
}

function validateMetadata(block) {
  const status = field(block, 'Status');
  if (status !== 'ready') {
    throw new BlueprintContractError('blueprint status must be ready');
  }
  const revision = field(block, 'Revision');
  const implementationBase = parseBase(
    field(block, 'Implementation base'),
    'implementation base',
  );
  const implementationStart = section(block, 2, 'Implementation start');
  const startBase = parseBase(
    field(implementationStart, 'Start from'),
    'implementation start base',
  );
  if (startBase !== implementationBase) {
    throw new BlueprintContractError(
      'implementation start base must match implementation base',
    );
  }
  return {
    implementationBase,
    implementationTicket: implementationTicketIdentity(
      field(block, 'Implementation ticket'),
    ),
    implementationStart,
    revision,
    status,
  };
}

function collectPlanStructure(block) {
  const designSlices = idsInSection(
    block,
    'Implementation slices',
    'S',
    true,
  );
  const testSlices = idsInSection(
    block,
    'Vertical red-green slices',
    'T',
    true,
  );
  const commands = idsInSection(block, 'Command admission', 'CMD');
  requireNonEmpty(designSlices, 'implementation slice');
  requireNonEmpty(testSlices, 'vertical red-green slice');
  requireNonEmpty(commands, 'admitted command');

  return {
    commands,
    commandSet: new Set(commands),
    declared: declaredIds(block),
    designSet: new Set(designSlices),
    designSlices,
    testSet: new Set(testSlices),
    testSlices,
  };
}

function validatePlanReferences(block, plan) {
  const testPlan = section(block, 2, 'TDD test plan');
  requireKnownReferences(
    testPlan,
    /^\s+- Implements design slice:\s*(S[0-9]+)\s*$/gm,
    plan.designSet,
    'design slice',
  );
  requireKnownReferences(
    testPlan,
    /^\s+- (?:Focused red\/green|Relevant regression) command:\s*(CMD[0-9]+)\s*$/gm,
    plan.commandSet,
    'command',
  );
  const traceability = section(block, 3, 'Traceability');
  for (const match of traceability.matchAll(/[→,]\s*([A-Z]+[0-9]+)/g)) {
    if (!plan.declared.has(match[1])) {
      throw new BlueprintContractError(
        `blueprint traceability references unknown ID "${match[1]}"`,
      );
    }
  }
}

function validateImplementationStart(implementationStart, plan) {
  const gate = field(implementationStart, 'Gate');
  if (!/^enabled\b/i.test(gate)
    || CONDITIONAL_GATE_PATTERN.test(gate)) {
    throw new BlueprintContractError('implementation gate must be enabled');
  }
  if (!/^- Invoke:\s*`?implement`?\b/m.test(implementationStart)) {
    throw new BlueprintContractError(
      'implementation start must invoke implement',
    );
  }
  const firstSlice = field(implementationStart, 'First slice')
    .match(/^`?([ST][0-9]+)`?\.?$/)?.[1];
  if (!plan.designSet.has(firstSlice) && !plan.testSet.has(firstSlice)) {
    throw new BlueprintContractError(
      `implementation start references unknown first slice "${firstSlice}"`,
    );
  }
}

// Semantic quality remains the evaluator's responsibility.
function validateImplementationBlueprint(source) {
  const block = extractMarkedBlock(source);
  if (headingCount(block, 1, 'Implementation blueprint') !== 1) {
    throw new BlueprintContractError(
      'blueprint must contain exactly one canonical title',
    );
  }
  requireSections(block);

  const metadata = validateMetadata(block);
  const plan = collectPlanStructure(block);
  validatePlanReferences(block, plan);
  requireReviews(block, 'Initial technical-design review', false);
  requireReviews(block, 'Final independent review', true);
  validateImplementationStart(metadata.implementationStart, plan);

  requireNoImplementationBlockers(block, metadata.implementationTicket);

  return Object.freeze({
    status: metadata.status,
    revision: metadata.revision,
    implementationBase: metadata.implementationBase,
    designSlices: Object.freeze(plan.designSlices),
    testSlices: Object.freeze(plan.testSlices),
    commands: Object.freeze(plan.commands),
    block,
  });
}

module.exports = {
  BlueprintContractError,
  validateImplementationBlueprint,
};
