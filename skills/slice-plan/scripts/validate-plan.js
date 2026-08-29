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
    'seam',
    'shape',
    'in_scope',
    'out_of_scope',
    'acceptance',
    'validation',
    'blockers',
    'consumes',
    'collisions',
  ], field);
  for (const name of ['id', 'title', 'outcome', 'seam']) {
    requireString(ticket[name], `${field}.${name}`);
  }
  if (!['vertical', 'prerequisite'].includes(ticket.shape)) {
    fail(`${field}.shape must be "vertical" or "prerequisite"`);
  }
  for (const name of ['in_scope', 'out_of_scope', 'acceptance', 'validation']) {
    validateStringArray(ticket[name], `${field}.${name}`);
  }
  validateStringArray(ticket.blockers, `${field}.blockers`, { allowEmpty: true });
  validateStringArray(ticket.collisions, `${field}.collisions`, { allowEmpty: true });
  requireArray(ticket.consumes, `${field}.consumes`, { allowEmpty: true });
  for (const [consumeIndex, consumption] of ticket.consumes.entries()) {
    const consumeField = `${field}.consumes[${consumeIndex}]`;
    requireExactFields(consumption, ['ticket_id', 'output'], consumeField);
    requireString(consumption.ticket_id, `${consumeField}.ticket_id`);
    requireString(consumption.output, `${consumeField}.output`);
  }
  const consumedTicketIds = ticket.consumes
    .map(({ ticket_id: ticketId }) => ticketId);
  assertUnique(consumedTicketIds, `${field}.consumes`);
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

function validatePrerequisites(plan) {
  for (const ticket of plan.tickets) {
    if (ticket.shape !== 'prerequisite') continue;
    const consumed = plan.tickets.some(({ consumes }) => (
      consumes.some(({ ticket_id: ticketId }) => ticketId === ticket.id)
    ));
    if (!consumed) {
      fail(
        `prerequisite ticket "${ticket.id}" must provide concrete output to a consumer`,
      );
    }
  }
}

function validateMigrationMetadata(migration) {
  requireExactFields(migration, [
    'prefactor_ticket_ids',
    'expansion_ticket_id',
    'migration_groups',
    'contraction_ticket_id',
  ], 'migration');
  validateStringArray(
    migration.prefactor_ticket_ids,
    'migration.prefactor_ticket_ids',
    { allowEmpty: true },
  );
  if (migration.expansion_ticket_id !== null) {
    requireString(
      migration.expansion_ticket_id,
      'migration.expansion_ticket_id',
    );
  }
  requireArray(migration.migration_groups, 'migration.migration_groups', {
    allowEmpty: true,
  });
  for (const [index, group] of migration.migration_groups.entries()) {
    const field = `migration.migration_groups[${index}]`;
    requireExactFields(group, [
      'id',
      'ticket_ids',
      'independently_mergeable',
      'green_independently',
      'integration_point',
    ], field);
    requireString(group.id, `${field}.id`);
    validateStringArray(group.ticket_ids, `${field}.ticket_ids`);
    if (typeof group.independently_mergeable !== 'boolean') {
      fail(`${field}.independently_mergeable must be a boolean`);
    }
    if (typeof group.green_independently !== 'boolean') {
      fail(`${field}.green_independently must be a boolean`);
    }
    if (group.integration_point !== null) {
      requireString(group.integration_point, `${field}.integration_point`);
    }
  }
  assertUnique(
    migration.migration_groups.map(({ id }) => id),
    'migration groups',
  );
  if (migration.contraction_ticket_id !== null) {
    requireString(
      migration.contraction_ticket_id,
      'migration.contraction_ticket_id',
    );
  }
}

function validateNormalMigration(migration) {
  if (migration.prefactor_ticket_ids.length > 0
    || migration.expansion_ticket_id !== null
    || migration.migration_groups.length > 0
    || migration.contraction_ticket_id !== null) {
    fail('normal migration must not declare prefactor or expand-contract phases');
  }
}

function validatePrefactorMigration(plan, ticketsById) {
  const { migration } = plan;
  if (migration.prefactor_ticket_ids.length === 0
    || migration.expansion_ticket_id !== null
    || migration.migration_groups.length > 0
    || migration.contraction_ticket_id !== null) {
    fail('prefactor migration must declare only prefactor_ticket_ids');
  }
  for (const prefactorId of migration.prefactor_ticket_ids) {
    const ticket = ticketsById.get(prefactorId);
    if (!ticket) fail(`prefactor names unknown ticket "${prefactorId}"`);
    if (ticket.shape !== 'prerequisite') {
      fail(`prefactor ticket "${prefactorId}" must have prerequisite shape`);
    }
    const consumers = plan.tickets.filter(
      ({ blockers }) => blockers.includes(prefactorId),
    );
    if (consumers.length < 2) {
      fail(
        `prefactor ticket "${prefactorId}" must provide concrete output to multiple consumers`,
      );
    }
  }
}

function validateExpandContractMigration(plan, ticketsById) {
  const { migration } = plan;
  if (migration.prefactor_ticket_ids.length > 0
    || migration.expansion_ticket_id === null
    || migration.migration_groups.length === 0
    || migration.contraction_ticket_id === null) {
    fail('expand-contract migration must declare expansion, groups, and contraction');
  }
  const expansionId = migration.expansion_ticket_id;
  const contractionId = migration.contraction_ticket_id;
  const expansion = ticketsById.get(expansionId);
  const contraction = ticketsById.get(contractionId);
  if (!expansion) fail(`expansion names unknown ticket "${expansionId}"`);
  if (!contraction) fail(`contraction names unknown ticket "${contractionId}"`);
  if (expansion.shape !== 'prerequisite') {
    fail(`expansion ticket "${expansionId}" must have prerequisite shape`);
  }

  const groupTicketIds = [];
  for (const group of migration.migration_groups) {
    if (!group.independently_mergeable) {
      fail(`migration group "${group.id}" must be independently mergeable`);
    }
    if (!group.green_independently && group.integration_point === null) {
      fail(
        `migration group "${group.id}" must record its required integration point`,
      );
    }
    for (const ticketId of group.ticket_ids) {
      const ticket = ticketsById.get(ticketId);
      if (!ticket) {
        fail(`migration group "${group.id}" names unknown ticket "${ticketId}"`);
      }
      if (!ticket.blockers.includes(expansionId)) {
        fail(
          `migration group ticket "${ticketId}" must depend on expansion "${expansionId}"`,
        );
      }
      groupTicketIds.push(ticketId);
    }
  }
  assertUnique(groupTicketIds, 'migration group tickets');
  if (!haveSameMembers(contraction.blockers, groupTicketIds)) {
    fail(
      `contraction ticket "${contractionId}" must depend directly on every migration group ticket`,
    );
  }
}

function validateMigration(plan) {
  validateMigrationMetadata(plan.migration);
  if (plan.migration_strategy === 'normal') {
    validateNormalMigration(plan.migration);
    return;
  }

  const ticketsById = new Map(plan.tickets.map((ticket) => [ticket.id, ticket]));
  if (plan.migration_strategy === 'prefactor') {
    validatePrefactorMigration(plan, ticketsById);
    return;
  }
  if (plan.migration_strategy === 'expand-contract') {
    validateExpandContractMigration(plan, ticketsById);
    return;
  }
  fail('migration_strategy must be "normal", "prefactor", or "expand-contract"');
}

function validateLineage(plan) {
  requireArray(plan.lineage, 'lineage', { allowEmpty: true });
  const ticketIds = new Set(plan.tickets.map(({ id }) => id));
  const predecessors = [];
  const successors = [];
  for (const [index, record] of plan.lineage.entries()) {
    const field = `lineage[${index}]`;
    requireExactFields(
      record,
      ['kind', 'predecessor_ids', 'successor_ids'],
      field,
    );
    if (!['split', 'combine', 'replace'].includes(record.kind)) {
      fail(`${field}.kind must be "split", "combine", or "replace"`);
    }
    validateStringArray(record.predecessor_ids, `${field}.predecessor_ids`);
    validateStringArray(record.successor_ids, `${field}.successor_ids`);
    if (record.kind === 'split'
      && (record.predecessor_ids.length !== 1
        || record.successor_ids.length < 2)) {
      fail(`${field} split must map one predecessor to multiple successors`);
    }
    if (record.kind === 'combine'
      && (record.predecessor_ids.length < 2
        || record.successor_ids.length !== 1)) {
      fail(`${field} combine must map multiple predecessors to one successor`);
    }
    if (record.kind === 'replace'
      && (record.predecessor_ids.length !== 1
        || record.successor_ids.length !== 1)) {
      fail(`${field} replace must map one predecessor to one successor`);
    }
    predecessors.push(...record.predecessor_ids);
    successors.push(...record.successor_ids);
  }
  assertUnique(predecessors, 'lineage predecessors');
  assertUnique(successors, 'lineage successors');
  const predecessorIds = new Set(predecessors);
  for (const predecessorId of predecessors) {
    if (ticketIds.has(predecessorId)) {
      fail(`lineage predecessor "${predecessorId}" is still a current ticket`);
    }
  }
  for (const successorId of successors) {
    if (!ticketIds.has(successorId) && !predecessorIds.has(successorId)) {
      fail(`lineage successor "${successorId}" does not reach a current ticket`);
    }
  }
  const lineageGraph = new Map();
  for (const record of plan.lineage) {
    for (const predecessorId of record.predecessor_ids) {
      lineageGraph.set(predecessorId, record.successor_ids);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visitLineage(id) {
    if (visiting.has(id)) fail('replacement lineage must be acyclic');
    if (visited.has(id) || !lineageGraph.has(id)) return;
    visiting.add(id);
    lineageGraph.get(id).forEach(visitLineage);
    visiting.delete(id);
    visited.add(id);
  }
  predecessors.forEach(visitLineage);
}

function validateDecisions(plan) {
  requireArray(plan.decisions, 'decisions', { allowEmpty: true });
  if (plan.status === 'ready' && plan.decisions.length > 0) {
    fail('ready plan must not contain unresolved decisions');
  }
  if (plan.status === 'needs-decision' && plan.decisions.length === 0) {
    fail('needs-decision plan must state at least one unresolved choice');
  }
  const requirementIds = new Set(plan.requirements.map(({ id }) => id));
  for (const [index, decision] of plan.decisions.entries()) {
    const field = `decisions[${index}]`;
    requireExactFields(
      decision,
      ['id', 'source', 'requirement_ids', 'choice', 'owner'],
      field,
    );
    for (const name of ['id', 'choice', 'owner']) {
      requireString(decision[name], `${field}.${name}`);
    }
    if (!['requirement', 'ticket-scope', 'planning-pressure'].includes(
      decision.source,
    )) {
      fail(
        `${field}.source must be "requirement", "ticket-scope", or "planning-pressure"`,
      );
    }
    validateStringArray(decision.requirement_ids, `${field}.requirement_ids`);
    for (const requirementId of decision.requirement_ids) {
      if (!requirementIds.has(requirementId)) {
        fail(`${field} names unknown requirement "${requirementId}"`);
      }
    }
  }
  assertUnique(plan.decisions.map(({ id }) => id), 'decisions');
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
    if (!['covered', 'excluded', 'unresolved'].includes(entry.disposition)) {
      fail(`${field}.disposition must be "covered", "excluded", or "unresolved"`);
    }
    validateStringArray(entry.ticket_ids, `${field}.ticket_ids`, {
      allowEmpty: entry.disposition !== 'covered',
    });
    requireString(entry.reason, `${field}.reason`);
    if (entry.disposition !== 'covered' && entry.ticket_ids.length > 0) {
      fail(`${field} ${entry.disposition} requirement cannot name tickets`);
    }
    if (plan.status === 'ready' && entry.disposition === 'unresolved') {
      fail(`${field} ready plan cannot leave a requirement unresolved`);
    }
    if (plan.status === 'needs-decision' && entry.disposition === 'covered') {
      fail(`${field} needs-decision plan cannot claim ticket coverage`);
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
  if (plan.status === 'needs-decision') {
    const unresolvedRequirementIds = new Set(
      plan.coverage_ledger
        .filter(({ disposition }) => disposition === 'unresolved')
        .map(({ requirement_id: requirementId }) => requirementId),
    );
    if (unresolvedRequirementIds.size === 0) {
      fail('needs-decision plan must leave at least one requirement unresolved');
    }
    const decidedRequirementIds = new Set(
      plan.decisions.flatMap(
        ({ requirement_ids: decisionRequirementIds }) => decisionRequirementIds,
      ),
    );
    for (const requirementId of unresolvedRequirementIds) {
      if (!decidedRequirementIds.has(requirementId)) {
        fail(`unresolved requirement "${requirementId}" has no stated decision`);
      }
    }
    for (const requirementId of decidedRequirementIds) {
      if (!unresolvedRequirementIds.has(requirementId)) {
        fail(`decision names settled requirement "${requirementId}"`);
      }
    }
  }
}

function validateFrontier(plan) {
  validateStringArray(plan.initial_frontier, 'initial_frontier', {
    allowEmpty: plan.status === 'needs-decision',
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
    'migration',
    'requirements',
    'coverage_ledger',
    'tickets',
    'lineage',
    'decisions',
    'initial_frontier',
  ], 'plan');
  if (plan.schema !== 'slice-plan/v2') {
    fail('plan.schema must be "slice-plan/v2"');
  }
  if (!['ready', 'needs-decision'].includes(plan.status)) {
    fail('plan.status must be "ready" or "needs-decision"');
  }
  validateRequirements(plan);
  requireArray(plan.tickets, 'tickets', {
    allowEmpty: plan.status === 'needs-decision',
  });
  plan.tickets.forEach(validateTicket);
  assertUnique(plan.tickets.map(({ id }) => id), 'tickets');
  const ticketIdentities = plan.tickets.map(ticketIdentity);
  if (new Set(ticketIdentities).size !== ticketIdentities.length) {
    fail('tickets contain duplicate outcome and seam');
  }
  if (plan.status === 'ready') {
    if (!['normal', 'prefactor', 'expand-contract'].includes(
      plan.migration_strategy,
    )) {
      fail('migration_strategy must be "normal", "prefactor", or "expand-contract"');
    }
    validateMigration(plan);
  } else {
    if (plan.migration_strategy !== null || plan.migration !== null) {
      fail('needs-decision plan must not invent a migration strategy');
    }
    if (plan.tickets.length > 0) {
      fail('needs-decision plan must not contain publishable tickets');
    }
  }
  validateLineage(plan);
  validateDecisions(plan);
  validateTicketReferences(plan);
  validatePrerequisites(plan);
  assertAcyclic(plan.tickets);
  assertTransitivelyMinimal(plan.tickets);
  validateCoverage(plan);
  validateFrontier(plan);
  return plan;
}

function ticketIdentity(ticket) {
  return JSON.stringify([ticket.outcome, ticket.seam]);
}

function lineageRecordKey(record) {
  return JSON.stringify([
    record.kind,
    [...record.predecessor_ids].sort(),
    [...record.successor_ids].sort(),
  ]);
}

function validateRegeneration(previousPlan, nextPlan) {
  validatePlan(previousPlan);
  validatePlan(nextPlan);
  if (previousPlan.status !== 'ready' || nextPlan.status !== 'ready') {
    fail('regeneration comparison requires ready plans');
  }
  const previousById = new Map(
    previousPlan.tickets.map((ticket) => [ticket.id, ticket]),
  );
  const nextById = new Map(nextPlan.tickets.map((ticket) => [ticket.id, ticket]));
  const previousByIdentity = new Map(
    previousPlan.tickets.map((ticket) => [ticketIdentity(ticket), ticket]),
  );
  const nextByIdentity = new Map(
    nextPlan.tickets.map((ticket) => [ticketIdentity(ticket), ticket]),
  );

  for (const [id, previousTicket] of previousById) {
    const nextTicket = nextById.get(id);
    if (nextTicket && ticketIdentity(previousTicket) !== ticketIdentity(nextTicket)) {
      fail(`regeneration reuses identity "${id}" for changed work`);
    }
  }
  for (const [identity, previousTicket] of previousByIdentity) {
    const nextTicket = nextByIdentity.get(identity);
    if (nextTicket && nextTicket.id !== previousTicket.id) {
      fail(
        `unchanged candidate "${previousTicket.id}" must preserve its identity`,
      );
    }
  }

  const previousLineageKeys = new Set(
    previousPlan.lineage.map(lineageRecordKey),
  );
  const nextLineageKeys = new Set(nextPlan.lineage.map(lineageRecordKey));
  for (const previousLineageKey of previousLineageKeys) {
    if (!nextLineageKeys.has(previousLineageKey)) {
      fail('regeneration must preserve existing replacement lineage');
    }
  }
  const newLineage = nextPlan.lineage.filter(
    (record) => !previousLineageKeys.has(lineageRecordKey(record)),
  );
  const lineageByPredecessor = new Map();
  for (const record of newLineage) {
    for (const predecessorId of record.predecessor_ids) {
      if (!previousById.has(predecessorId)) {
        fail(`lineage names unknown predecessor ticket "${predecessorId}"`);
      }
      if (nextById.has(predecessorId)) {
        fail(`lineage predecessor "${predecessorId}" reuses a changed identity`);
      }
      lineageByPredecessor.set(predecessorId, record);
    }
    for (const successorId of record.successor_ids) {
      if (previousById.has(successorId)) {
        fail(`lineage successor "${successorId}" reuses a previous identity`);
      }
    }
  }
  for (const id of previousById.keys()) {
    if (!nextById.has(id) && !lineageByPredecessor.has(id)) {
      fail(`removed ticket "${id}" has no replacement lineage`);
    }
  }
  return nextPlan;
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
  if (argv.length < 1 || argv.length > 2) {
    fail('usage: validate-plan.js <plan.json> [previous-plan.json]');
  }
  const plan = validatePlan(readPlan(argv[0]));
  if (argv.length === 2) {
    validateRegeneration(readPlan(argv[1]), plan);
    process.stdout.write('Validated regeneration lineage\n');
  }
  process.stdout.write(`Valid slice-plan/v2 ${plan.status} plan\n`);
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
  validateRegeneration,
};
