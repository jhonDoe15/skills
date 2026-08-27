#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_PLAN_BYTES = 5 * 1024 * 1024;

class PlanValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

function fail(message) {
  throw new PlanValidationError(message);
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
}

function requireExactFields(value, fields, field) {
  requireObject(value, field);
  const expected = new Set(fields);
  const unknown = Object.keys(value).find((key) => !expected.has(key));
  if (unknown) fail(`${field} has unsupported field "${unknown}"`);
  const missing = fields.find((key) => !Object.hasOwn(value, key));
  if (missing) fail(`${field} is missing "${missing}"`);
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a non-empty string`);
  }
}

function requireArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${field} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`);
  }
}

function assertUnique(values, field) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${field} contains duplicate "${value}"`);
    seen.add(value);
  }
}

function validateStringArray(value, field, { allowEmpty = false } = {}) {
  requireArray(value, field, { allowEmpty });
  value.forEach((item, index) => requireString(item, `${field}[${index}]`));
  assertUnique(value, field);
}

function haveSameMembers(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((value) => expected.has(value));
}

function validateRequirements(plan) {
  requireArray(plan.requirements, 'requirements');
  for (const [index, requirement] of plan.requirements.entries()) {
    const field = `requirements[${index}]`;
    requireExactFields(requirement, ['id', 'text'], field);
    requireString(requirement.id, `${field}.id`);
    requireString(requirement.text, `${field}.text`);
  }
  assertUnique(plan.requirements.map(({ id }) => id), 'requirements');
}

function validateTicket(ticket, index) {
  const field = `tickets[${index}]`;
  requireExactFields(ticket, [
    'id',
    'title',
    'outcome',
    'shape',
    'in_scope',
    'out_of_scope',
    'acceptance',
    'validation',
    'replaces',
    'blockers',
    'consumes',
    'collisions',
  ], field);
  for (const name of ['id', 'title', 'outcome']) {
    requireString(ticket[name], `${field}.${name}`);
  }
  if (!['vertical', 'prerequisite'].includes(ticket.shape)) {
    fail(`${field}.shape must be "vertical" or "prerequisite"`);
  }
  for (const name of ['in_scope', 'out_of_scope', 'acceptance', 'validation']) {
    validateStringArray(ticket[name], `${field}.${name}`);
  }
  validateStringArray(ticket.replaces, `${field}.replaces`, { allowEmpty: true });
  validateStringArray(ticket.blockers, `${field}.blockers`, { allowEmpty: true });
  validateStringArray(ticket.collisions, `${field}.collisions`, { allowEmpty: true });
  requireArray(ticket.consumes, `${field}.consumes`, { allowEmpty: true });
  for (const [consumeIndex, consumption] of ticket.consumes.entries()) {
    const consumeField = `${field}.consumes[${consumeIndex}]`;
    requireExactFields(consumption, ['ticket_id', 'output'], consumeField);
    requireString(consumption.ticket_id, `${consumeField}.ticket_id`);
    requireString(consumption.output, `${consumeField}.output`);
  }
  assertUnique(
    ticket.consumes.map(({ ticket_id: ticketId }) => ticketId),
    `${field}.consumes`,
  );
  const consumedTicketIds = ticket.consumes
    .map(({ ticket_id: ticketId }) => ticketId);
  if (!haveSameMembers(ticket.blockers, consumedTicketIds)) {
    fail(`${field} blockers and consumes must identify the same direct tickets`);
  }
}

function validateTicketReferences(plan) {
  const ticketIds = new Set(plan.tickets.map(({ id }) => id));
  for (const [index, ticket] of plan.tickets.entries()) {
    for (const blocker of ticket.blockers) {
      if (!ticketIds.has(blocker)) {
        fail(`tickets[${index}].blockers names unknown ticket "${blocker}"`);
      }
      if (blocker === ticket.id) {
        fail(`tickets[${index}] cannot block itself`);
      }
    }
  }
}

function assertAcyclic(tickets) {
  const dependencies = new Map(tickets.map((ticket) => [ticket.id, ticket.blockers]));
  const visiting = new Set();
  const visited = new Set();

  function visit(ticketId) {
    if (visiting.has(ticketId)) fail('ticket dependency graph must be acyclic');
    if (visited.has(ticketId)) return;
    visiting.add(ticketId);
    dependencies.get(ticketId).forEach(visit);
    visiting.delete(ticketId);
    visited.add(ticketId);
  }
  tickets.forEach(({ id }) => visit(id));
}

function assertTransitivelyMinimal(tickets) {
  const dependencies = new Map(tickets.map((ticket) => [ticket.id, ticket.blockers]));

  function hasPath(from, target, visited = new Set()) {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return dependencies.get(from).some((dependency) => (
      hasPath(dependency, target, visited)
    ));
  }

  for (const ticket of tickets) {
    for (const blocker of ticket.blockers) {
      const isRedundant = ticket.blockers.some((candidate) => (
        candidate !== blocker && hasPath(candidate, blocker)
      ));
      if (isRedundant) {
        fail(
          `ticket "${ticket.id}" has transitively redundant blocker "${blocker}"`,
        );
      }
    }
  }
}

function validateCoverage(plan) {
  requireArray(plan.coverage_ledger, 'coverage_ledger');
  const requirementIds = new Set(plan.requirements.map(({ id }) => id));
  const ticketIds = new Set(plan.tickets.map(({ id }) => id));
  for (const [index, entry] of plan.coverage_ledger.entries()) {
    const field = `coverage_ledger[${index}]`;
    requireExactFields(
      entry,
      ['requirement_id', 'disposition', 'ticket_ids', 'reason'],
      field,
    );
    requireString(entry.requirement_id, `${field}.requirement_id`);
    if (!requirementIds.has(entry.requirement_id)) {
      fail(`${field} names unknown requirement "${entry.requirement_id}"`);
    }
    if (!['covered', 'excluded'].includes(entry.disposition)) {
      fail(`${field}.disposition must be "covered" or "excluded"`);
    }
    validateStringArray(entry.ticket_ids, `${field}.ticket_ids`, {
      allowEmpty: entry.disposition === 'excluded',
    });
    requireString(entry.reason, `${field}.reason`);
    if (entry.disposition === 'excluded' && entry.ticket_ids.length > 0) {
      fail(`${field} excluded requirement cannot name tickets`);
    }
    for (const ticketId of entry.ticket_ids) {
      if (!ticketIds.has(ticketId)) {
        fail(`${field} names unknown ticket "${ticketId}"`);
      }
    }
  }
  const ledgerRequirementIds = plan.coverage_ledger
    .map(({ requirement_id: requirementId }) => requirementId);
  if (!haveSameMembers(ledgerRequirementIds, [...requirementIds])) {
    fail('coverage_ledger must cover every requirement exactly once');
  }
  assertUnique(ledgerRequirementIds, 'coverage_ledger');

  const tracedTickets = new Set(
    plan.coverage_ledger.flatMap(({ ticket_ids: ticketIds }) => ticketIds),
  );
  const untracedTicket = plan.tickets.find(({ id }) => !tracedTickets.has(id));
  if (untracedTicket) {
    fail(`ticket "${untracedTicket.id}" is not traced to a covered requirement`);
  }
}

function validateFrontier(plan) {
  validateStringArray(plan.initial_frontier, 'initial_frontier', {
    allowEmpty: false,
  });
  const expected = plan.tickets
    .filter(({ blockers }) => blockers.length === 0)
    .map(({ id }) => id);
  if (!haveSameMembers(plan.initial_frontier, expected)) {
    fail('initial_frontier must contain exactly the tickets without blockers');
  }
}

function validatePlan(plan) {
  requireExactFields(plan, [
    'schema',
    'status',
    'migration_strategy',
    'requirements',
    'coverage_ledger',
    'tickets',
    'initial_frontier',
  ], 'plan');
  if (plan.schema !== 'slice-plan/v1') {
    fail('plan.schema must be "slice-plan/v1"');
  }
  if (plan.status !== 'ready') {
    fail('ordinary plan.status must be "ready"');
  }
  if (plan.migration_strategy !== 'normal') {
    fail('ordinary plan.migration_strategy must be "normal"');
  }
  validateRequirements(plan);
  requireArray(plan.tickets, 'tickets');
  plan.tickets.forEach(validateTicket);
  assertUnique(plan.tickets.map(({ id }) => id), 'tickets');
  assertUnique(
    plan.tickets.flatMap(({ replaces }) => replaces),
    'replacement lineage',
  );
  validateTicketReferences(plan);
  assertAcyclic(plan.tickets);
  assertTransitivelyMinimal(plan.tickets);
  validateCoverage(plan);
  validateFrontier(plan);
  return plan;
}

function readPlan(planPath) {
  const resolved = path.resolve(planPath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('plan path must be a regular non-symlink file');
  }
  if (stat.size > MAX_PLAN_BYTES) fail('plan file exceeds 5 MiB');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function main(argv) {
  if (argv.length !== 1) fail('usage: validate-plan.js <plan.json>');
  validatePlan(readPlan(argv[0]));
  process.stdout.write('Valid slice-plan/v1 ready plan\n');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof SyntaxError
      ? 'plan must contain valid JSON'
      : error.message;
    process.stderr.write(`Invalid plan: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  PlanValidationError,
  validatePlan,
};
