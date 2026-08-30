'use strict';

const crypto = require('node:crypto');
const {
  validateTakeTicketResult,
} = require('../../take-ticket/evals/lifecycle');

const TERMINAL_STATE_POLICY = Object.freeze({
  completed: { bucket: 'completed_tickets' },
  held: { bucket: 'held_tickets', finalStatusRank: 4 },
  failed: {
    bucket: 'failed_tickets',
    finalStatusRank: 1,
    preserveOnResume: true,
  },
  retryable: {
    bucket: 'retryable_tickets',
    finalStatusRank: 3,
    preserveOnResume: true,
  },
  'human-decision': {
    bucket: 'human_decision_tickets',
    finalStatusRank: 2,
    preserveOnResume: true,
  },
});
const INCOMPLETE_LIFECYCLE_STATES = Object.freeze(
  Object.keys(TERMINAL_STATE_POLICY).filter((state) => state !== 'completed'),
);
const RETAINED_TERMINAL_STATES = Object.freeze(
  Object.entries(TERMINAL_STATE_POLICY)
    .filter(([, policy]) => policy.preserveOnResume)
    .map(([state]) => state),
);
const INITIAL_TICKET_STATES = Object.freeze([
  'open',
  'completed',
  ...RETAINED_TERMINAL_STATES,
]);

class DispatchArtifactError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DispatchArtifactError';
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DispatchArtifactError(`${field} must be an object`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new DispatchArtifactError(`${field} must be an array`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DispatchArtifactError(`${field} must be a non-empty string`);
  }
}

function requireSequence(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new DispatchArtifactError(`${field} must be a positive integer`);
  }
}

function assertUnique(values, field) {
  if (new Set(values).size !== values.length) {
    throw new DispatchArtifactError(`${field} must contain unique values`);
  }
}

function assertSameMembers(actual, expected, field) {
  requireArray(actual, field);
  assertUnique(actual, field);
  if (actual.length !== expected.length
    || expected.some((value) => !actual.includes(value))) {
    throw new DispatchArtifactError(`${field} does not match calculated state`);
  }
}

function dependencyKey(ticket, dependency) {
  return `${ticket}\0${dependency}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Fingerprint(value) {
  return `sha256:${crypto.createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function sourceFingerprintInputs(artifact) {
  return {
    source_dag: artifact.source_dag,
    collision_constraints: artifact.collision_constraints,
  };
}

function executionFingerprintInputs(artifact) {
  return {
    execution_context: artifact.execution_context,
    executor: artifact.executor,
  };
}

function validateFingerprint(
  record,
  field,
  expectedInputs,
  expectedReferences,
  requireRetained,
) {
  requireObject(record, field);
  assertSameMembers(
    record.current_inputs,
    expectedReferences,
    `${field}.current_inputs`,
  );
  requireString(record.current, `${field}.current`);
  if (record.current !== sha256Fingerprint(expectedInputs)) {
    throw new DispatchArtifactError(
      `${field} does not verify its current inputs`,
    );
  }
  if (!requireRetained) return;
  requireObject(record.retained_inputs, `${field}.retained_inputs`);
  requireString(record.retained, `${field}.retained`);
  if (record.retained !== sha256Fingerprint(record.retained_inputs)
    || record.decision !== 'compatible'
    || record.retained !== record.current) {
    throw new DispatchArtifactError(
      `${field} retained inputs are stale or mismatched`,
    );
  }
}

function assertAcyclic(tickets) {
  const dependencies = new Map(
    tickets.map(({ id, dependencies: required }) => [id, required]),
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(ticket) {
    if (visiting.has(ticket)) {
      throw new DispatchArtifactError('source DAG contains a ticket cycle');
    }
    if (visited.has(ticket)) return;
    visiting.add(ticket);
    for (const dependency of dependencies.get(ticket)) visit(dependency);
    visiting.delete(ticket);
    visited.add(ticket);
  }

  for (const ticket of dependencies.keys()) visit(ticket);
}

function validateSourceDag(sourceDag) {
  requireString(sourceDag.identity, 'source DAG identity');
  requireArray(sourceDag.tickets, 'source DAG tickets');
  requireArray(sourceDag.dependencies, 'source DAG dependencies');
  const ticketIds = sourceDag.tickets.map((ticket, index) => {
    requireObject(ticket, `source DAG tickets[${index}]`);
    requireString(ticket.id, `source DAG tickets[${index}].id`);
    requireArray(ticket.dependencies, `source DAG tickets[${index}].dependencies`);
    assertUnique(ticket.dependencies, `source DAG tickets[${index}].dependencies`);
    if (!INITIAL_TICKET_STATES.includes(ticket.initial_state)) {
      throw new DispatchArtifactError(
        `source DAG tickets[${index}].initial_state is invalid`,
      );
    }
    if (RETAINED_TERMINAL_STATES.includes(ticket.initial_state)) {
      requireObject(
        ticket.initial_recovery,
        `source DAG tickets[${index}].initial_recovery`,
      );
      if (!Number.isInteger(ticket.initial_recovery.sequence)
        || ticket.initial_recovery.sequence < 0) {
        throw new DispatchArtifactError(
          `source DAG tickets[${index}].initial_recovery.sequence is invalid`,
        );
      }
      requireString(
        ticket.initial_recovery.action,
        `source DAG tickets[${index}].initial_recovery.action`,
      );
    }
    return ticket.id;
  });
  assertUnique(ticketIds, 'source DAG ticket identities');
  const knownTickets = new Set(ticketIds);
  const ticketStates = new Map(
    sourceDag.tickets.map(({ id, initial_state: state }) => [id, state]),
  );
  const declaredEdges = [];
  for (const [index, ticket] of sourceDag.tickets.entries()) {
    for (const dependency of ticket.dependencies) {
      if (!knownTickets.has(dependency) || dependency === ticket.id) {
        throw new DispatchArtifactError(
          `source DAG tickets[${index}] has an invalid dependency`,
        );
      }
      declaredEdges.push(dependencyKey(ticket.id, dependency));
    }
  }
  const retainedEdges = sourceDag.dependencies.map((edge, index) => {
    requireObject(edge, `source DAG dependencies[${index}]`);
    requireString(edge.ticket, `source DAG dependencies[${index}].ticket`);
    requireString(edge.depends_on, `source DAG dependencies[${index}].depends_on`);
    if (!['open', 'satisfied'].includes(edge.initial_state)) {
      throw new DispatchArtifactError(
        `source DAG dependencies[${index}].initial_state is invalid`,
      );
    }
    const dependencyWasCompleted =
      ticketStates.get(edge.depends_on) === 'completed';
    if ((edge.initial_state === 'satisfied') !== dependencyWasCompleted) {
      throw new DispatchArtifactError(
        `source DAG dependencies[${index}] has inconsistent pre-satisfied edge state`,
      );
    }
    return dependencyKey(edge.ticket, edge.depends_on);
  });
  assertUnique(retainedEdges, 'source DAG dependencies');
  assertSameMembers(retainedEdges, declaredEdges, 'source DAG dependencies');
  assertAcyclic(sourceDag.tickets);
  return { ticketIds, ticketStates };
}

function validateExecutionContext(context) {
  requireObject(context, 'execution context');
  for (const name of ['repositories', 'trackers']) {
    requireArray(context[name], `execution context ${name}`);
    if (context[name].length === 0) {
      throw new DispatchArtifactError(
        `execution context ${name} must retain a boundary`,
      );
    }
    for (const [index, value] of context[name].entries()) {
      requireString(value, `execution context ${name}[${index}]`);
    }
    assertUnique(context[name], `execution context ${name}`);
  }
  assertSameMembers(
    context.canonical_dependencies,
    ['take-ticket', 'take-it-offline'],
    'execution context canonical dependencies',
  );
  requireString(context.immutable_base, 'execution context immutable base');
  if (!/^[a-f0-9]{40}$/.test(context.immutable_base)) {
    throw new DispatchArtifactError(
      'execution context immutable base must be immutable',
    );
  }
}

function validateCanonicalRetainedBinding(binding, decision, resolveArtifact) {
  requireString(binding.ticket, 'retained reviewed-ticket binding ticket');
  requireString(
    binding.result_reference,
    'retained reviewed-ticket binding result reference',
  );
  requireObject(
    binding.invocation,
    'retained reviewed-ticket binding invocation',
  );
  requireObject(
    binding.completion,
    'retained reviewed-ticket binding completion',
  );
  requireString(
    binding.invocation.reference,
    'retained reviewed-ticket binding invocation reference',
  );
  requireString(
    binding.completion.reference,
    'retained reviewed-ticket binding completion reference',
  );
  requireString(
    binding.completion.result_reference,
    'retained reviewed-ticket binding completion result reference',
  );
  if (binding.ticket !== decision.ticket
    || binding.invocation.ticket !== decision.ticket
    || binding.invocation.skill !== 'take-ticket'
    || binding.invocation.status !== 'succeeded'
    || binding.completion.ticket !== decision.ticket
    || binding.completion.status !== 'complete'
    || binding.completion.authority !== 'reviewed-ticket'
    || binding.completion.result_reference !== binding.result_reference) {
    throw new DispatchArtifactError(
      'canonical retained result is not bound to the exact skipped ticket',
    );
  }
  const result = resolveArtifact(binding.result_reference);
  requireObject(result, 'resume evidence canonical take-ticket result');
  try {
    validateTakeTicketResult(result);
    if (result.status === 'reviewed') return;
  } catch {
    // Normalize canonical Take Ticket validation failures below.
  }
  throw new DispatchArtifactError(
    'resume evidence requires a complete authoritative reviewed-ticket result',
  );
}

function validateRetainedReviewedTicket(decision, resolveArtifact) {
  if (typeof resolveArtifact !== 'function') {
    throw new DispatchArtifactError(
      'resume evidence requires a retained-result resolver',
    );
  }
  const retained = resolveArtifact(decision.retained_result);
  requireObject(retained, 'resume evidence retained reviewed-ticket result');
  if (retained.schema === 'dispatch-retained-reviewed-ticket/v1') {
    validateCanonicalRetainedBinding(retained, decision, resolveArtifact);
    return;
  }
  if (retained.schema === 'take-ticket-result/v1') {
    throw new DispatchArtifactError(
      'canonical retained result is not bound to the exact skipped ticket',
    );
  }
  try {
    if (retained.schema === 'fixture-reviewed-ticket/v1') {
      validateFixtureReviewedTicket(retained, {
        ticket: decision.ticket,
        started_sequence: retained.invocation?.sequence,
        completed_sequence: retained.completion?.sequence,
        result: {
          implementation_handoff: retained.phases?.[0]?.artifact,
          review_brief: retained.phases?.[1]?.artifact,
        },
      });
      return;
    }
  } catch {
    // Normalize fixture validation failures below.
  }
  throw new DispatchArtifactError(
    'resume evidence requires a complete authoritative reviewed-ticket result',
  );
}

function validateResumeEvidence(
  artifact,
  ticketIds,
  ticketStates,
  resolveArtifact,
) {
  requireObject(artifact.resume, 'resume evidence');
  validateFingerprint(
    artifact.resume.source_dag_fingerprint,
    'source DAG fingerprint',
    sourceFingerprintInputs(artifact),
    ['$.source_dag', '$.collision_constraints'],
    artifact.resume.requested === true,
  );
  validateFingerprint(
    artifact.resume.execution_fingerprint,
    'execution fingerprint',
    executionFingerprintInputs(artifact),
    ['$.execution_context', '$.executor'],
    artifact.resume.requested === true,
  );
  if (artifact.resume.requested === false) {
    if (artifact.resume.decision !== 'fresh') {
      throw new DispatchArtifactError(
        'resume evidence must retain the fresh dispatch decision',
      );
    }
    return;
  }
  if (artifact.resume.requested !== true) {
    throw new DispatchArtifactError(
      'resume evidence must identify a requested resume',
    );
  }
  requireString(artifact.resume.retained_state, 'resume evidence retained state');
  if (artifact.resume.evidence_status !== 'complete') {
    throw new DispatchArtifactError('resume evidence must be complete');
  }
  requireArray(artifact.resume.ticket_decisions, 'resume evidence ticket decisions');
  const decidedTickets = artifact.resume.ticket_decisions.map(
    ({ ticket }) => ticket,
  );
  assertSameMembers(
    decidedTickets,
    ticketIds,
    'resume evidence ticket decisions',
  );
  for (const [index, decision] of artifact.resume.ticket_decisions.entries()) {
    const field = `resume evidence ticket decisions[${index}]`;
    requireObject(decision, field);
    requireString(decision.ticket, `${field}.ticket`);
    if (decision.decision === 'skip-completed') {
      if (ticketStates.get(decision.ticket) !== 'completed') {
        throw new DispatchArtifactError(
          `${field} cannot skip incomplete lifecycle work`,
        );
      }
      requireString(decision.retained_result, `${field}.retained_result`);
      validateRetainedReviewedTicket(decision, resolveArtifact);
    } else if (decision.decision === 'restart-incomplete') {
      if (ticketStates.get(decision.ticket) !== 'open') {
        throw new DispatchArtifactError(
          `${field} cannot restart terminal lifecycle work`,
        );
      }
    } else if (decision.decision === 'preserve-terminal') {
      if (!RETAINED_TERMINAL_STATES.includes(
        ticketStates.get(decision.ticket),
      )) {
        throw new DispatchArtifactError(
          `${field} cannot preserve non-terminal lifecycle work`,
        );
      }
    } else {
      throw new DispatchArtifactError(`${field}.decision is invalid`);
    }
  }
}

function validateExecutorSelection(artifact) {
  requireObject(artifact.executor, 'executor selection');
  const precedence = ['repository', 'project', 'user', 'bundled-default'];
  if (!Array.isArray(artifact.executor.precedence)
    || artifact.executor.precedence.length !== precedence.length
    || precedence.some((scope, index) => (
      artifact.executor.precedence[index] !== scope
    ))) {
    throw new DispatchArtifactError(
      'executor selection must retain canonical configuration precedence',
    );
  }
  requireObject(artifact.executor.candidates, 'executor selection candidates');
  let configured;
  for (const scope of precedence) {
    const candidate = artifact.executor.candidates[scope];
    requireObject(candidate, `executor selection candidates.${scope}`);
    requireString(candidate.source, `executor selection candidates.${scope}.source`);
    if (candidate.value !== null
      && (!Number.isInteger(candidate.value) || candidate.value < 1)) {
      throw new DispatchArtifactError(
        `executor selection candidates.${scope}.value is invalid`,
      );
    }
    const scopedCandidate = { ...candidate, scope };
    if (configured === undefined && candidate.value !== null) {
      configured = scopedCandidate;
    }
  }
  if (!configured) {
    throw new DispatchArtifactError('executor selection has no usable candidate');
  }
  requireObject(artifact.executor.selected, 'executor selection selected');
  if (artifact.executor.selected.scope !== configured.scope
    || artifact.executor.selected.value !== configured.value
    || artifact.executor.selected.source !== configured.source) {
    throw new DispatchArtifactError(
      'executor selection does not follow configuration precedence',
    );
  }
  return configured.value;
}

function validateCollisionConstraints(artifact, ticketIds) {
  requireArray(artifact.collision_constraints, 'collision constraints');
  const collisionPairs = new Set();
  const identities = [];
  for (const [index, constraint] of artifact.collision_constraints.entries()) {
    const field = `collision constraints[${index}]`;
    requireObject(constraint, field);
    requireString(constraint.id, `${field}.id`);
    requireString(constraint.source, `${field}.source`);
    requireArray(constraint.tickets, `${field}.tickets`);
    assertUnique(constraint.tickets, `${field}.tickets`);
    if (constraint.tickets.length < 2
      || constraint.tickets.some((ticket) => !ticketIds.includes(ticket))) {
      throw new DispatchArtifactError(
        `${field} must identify at least two known tickets`,
      );
    }
    identities.push(constraint.id);
    for (let left = 0; left < constraint.tickets.length; left += 1) {
      for (let right = left + 1; right < constraint.tickets.length; right += 1) {
        collisionPairs.add(
          dependencyKey(
            ...[constraint.tickets[left], constraint.tickets[right]].sort(),
          ),
        );
      }
    }
  }
  assertUnique(identities, 'collision constraint identities');
  return collisionPairs;
}

function validateMutationEvidence(mutation, field) {
  requireObject(mutation, field);
  requireString(mutation.id, `${field}.id`);
  requireString(mutation.action, `${field}.action`);
  requireString(mutation.target, `${field}.target`);
  requireString(mutation.repository, `${field}.repository`);
  requireString(mutation.evidence, `${field}.evidence`);
}

function prMutationTupleKey({ repository, action, target }) {
  return JSON.stringify([repository, action, target]);
}

function validatePrAuthorizationTuple(tuple, field) {
  requireObject(tuple, field);
  requireString(tuple.repository, `${field}.repository`);
  requireString(tuple.action, `${field}.action`);
  requireString(tuple.target, `${field}.target`);
  return prMutationTupleKey(tuple);
}

function validatePrMaintenance(artifact, ticketIds) {
  requireArray(artifact.pr_maintenance, 'PR maintenance authorization');
  const maintenanceTickets = [];
  for (const [index, maintenance] of artifact.pr_maintenance.entries()) {
    const field = `PR maintenance authorization[${index}]`;
    requireObject(maintenance, field);
    requireString(maintenance.ticket, `${field}.ticket`);
    if (!ticketIds.includes(maintenance.ticket)) {
      throw new DispatchArtifactError(`${field} references an unknown ticket`);
    }
    requireObject(maintenance.authorization, `${field}.authorization`);
    requireString(
      maintenance.authorization.source,
      `${field}.authorization.source`,
    );
    if (typeof maintenance.authorization.granted !== 'boolean') {
      throw new DispatchArtifactError(
        `${field} must retain an explicit PR maintenance authorization decision`,
      );
    }
    requireArray(maintenance.attempted_mutations, `${field}.attempted_mutations`);
    requireArray(maintenance.completed_mutations, `${field}.completed_mutations`);
    if (maintenance.authorization.granted !== true) {
      requireString(maintenance.needed_action, `${field}.needed_action`);
      if (maintenance.attempted_mutations.length > 0
        || maintenance.completed_mutations.length > 0) {
        throw new DispatchArtifactError(
          `${field} cannot mutate without PR maintenance authorization`,
        );
      }
    } else {
      requireObject(
        maintenance.authorization.scope,
        `${field}.authorization.scope`,
      );
      const scope = maintenance.authorization.scope;
      requireArray(scope.tuples, `${field}.authorization.scope.tuples`);
      if (scope.tuples.length === 0) {
        throw new DispatchArtifactError(
          `${field} has an invalid PR maintenance authorization scope`,
        );
      }
      const allowedMutations = new Set(scope.tuples.map(
        (tuple, tupleIndex) => {
          const tupleField = `${field}.authorization.scope.tuples[${tupleIndex}]`;
          const tupleKey = validatePrAuthorizationTuple(tuple, tupleField);
          if (!artifact.execution_context.repositories.includes(
            tuple.repository,
          )) {
            throw new DispatchArtifactError(
              `${field} has an invalid PR maintenance authorization scope`,
            );
          }
          return tupleKey;
        },
      ));
      if (allowedMutations.size !== scope.tuples.length) {
        throw new DispatchArtifactError(
          `${field} contains duplicate PR maintenance authorization tuples`,
        );
      }
      const attempted = new Map();
      for (const [mutationIndex, mutation] of (
        maintenance.attempted_mutations.entries()
      )) {
        const mutationField =
          `${field}.attempted_mutations[${mutationIndex}]`;
        validateMutationEvidence(mutation, mutationField);
        if (mutation.outcome !== 'attempted'
          || !allowedMutations.has(prMutationTupleKey(mutation))) {
          throw new DispatchArtifactError(
            `${field} attempted a mutation outside its exact PR maintenance authorization tuple`,
          );
        }
        if (attempted.has(mutation.id)) {
          throw new DispatchArtifactError(
            `${field} contains duplicate attempted mutations`,
          );
        }
        attempted.set(mutation.id, mutation);
      }
      const completed = new Set();
      for (const [mutationIndex, mutation] of (
        maintenance.completed_mutations.entries()
      )) {
        const mutationField =
          `${field}.completed_mutations[${mutationIndex}]`;
        validateMutationEvidence(mutation, mutationField);
        const attempt = attempted.get(mutation.id);
        if (mutation.outcome !== 'completed'
          || !attempt
          || attempt.action !== mutation.action
          || attempt.target !== mutation.target
          || attempt.repository !== mutation.repository
          || completed.has(mutation.id)) {
          throw new DispatchArtifactError(
            `${field} has invalid completed PR mutation evidence`,
          );
        }
        completed.add(mutation.id);
      }
    }
    maintenanceTickets.push(maintenance.ticket);
  }
  assertUnique(maintenanceTickets, 'PR maintenance authorization tickets');
}

function ticketsCollide(left, right, collisionPairs) {
  return collisionPairs.has(dependencyKey(...[left, right].sort()));
}

function lifecycleTerminalSequence(lifecycle) {
  return lifecycle.state === 'completed'
    ? lifecycle.completed_sequence
    : lifecycle.terminal_sequence;
}

function completedTicketIds(lifecycles) {
  return [...lifecycles.values()]
    .filter(({ state }) => state === 'completed')
    .map(({ ticket }) => ticket);
}

function calculateFinalStatus(expected, ticketCount) {
  if (expected.completed_tickets.length === ticketCount) return 'completed';
  return Object.entries(TERMINAL_STATE_POLICY)
    .filter(([, policy]) => (
      policy.finalStatusRank
      && expected[policy.bucket].length > 0
    ))
    .sort(([, left], [, right]) => (
      left.finalStatusRank - right.finalStatusRank
    ))
    .map(([state]) => state)[0] ?? 'blocked';
}

function validateTicketLifecycles(artifact, ticketIds, ticketStates) {
  requireArray(artifact.ticket_lifecycles, 'ticket lifecycles');
  const lifecycles = new Map();
  for (const [index, lifecycle] of artifact.ticket_lifecycles.entries()) {
    const field = `ticket lifecycles[${index}]`;
    requireObject(lifecycle, field);
    requireString(lifecycle.ticket, `${field}.ticket`);
    requireString(lifecycle.state, `${field}.state`);
    requireSequence(lifecycle.started_sequence, `${field}.started_sequence`);
    const terminalSequence = lifecycleTerminalSequence(lifecycle);
    requireSequence(terminalSequence, `${field}.terminal_sequence`);
    if (lifecycle.started_sequence >= terminalSequence) {
      throw new DispatchArtifactError(`${field} terminates before it starts`);
    }
    if (!ticketIds.includes(lifecycle.ticket)
      || ticketStates.get(lifecycle.ticket) !== 'open') {
      throw new DispatchArtifactError(
        `${field} cannot start from its retained initial state`,
      );
    }
    requireObject(lifecycle.result, `${field}.result`);
    if (lifecycle.state === 'completed') {
      if (lifecycle.result.status !== 'complete'
        || lifecycle.result.authority !== 'reviewed-ticket') {
        throw new DispatchArtifactError(
          `${field} requires a complete authoritative reviewed-ticket result`,
        );
      }
      requireString(
        lifecycle.result.implementation_handoff,
        `${field}.result.implementation_handoff`,
      );
      requireString(lifecycle.result.review_brief, `${field}.result.review_brief`);
    } else if (INCOMPLETE_LIFECYCLE_STATES.includes(lifecycle.state)) {
      if (lifecycle.result.status !== lifecycle.state) {
        throw new DispatchArtifactError(
          `${field}.result.status contradicts its terminal state`,
        );
      }
      requireString(
        lifecycle.result.recovery_action,
        `${field}.result.recovery_action`,
      );
    } else {
      throw new DispatchArtifactError(`${field}.state is invalid`);
    }
    if (lifecycles.has(lifecycle.ticket)) {
      throw new DispatchArtifactError('ticket lifecycles contain duplicate tickets');
    }
    lifecycles.set(lifecycle.ticket, lifecycle);
  }
  return lifecycles;
}

function validateWorktreeOwnership(artifact, lifecycles, ticketIds) {
  requireArray(artifact.worktrees, 'worktree ownership');
  const owners = [];
  const paths = [];
  const worktreeTickets = [];
  const createdTickets = [];
  const creationFailures = new Map();
  for (const [index, worktree] of artifact.worktrees.entries()) {
    const field = `worktree ownership[${index}]`;
    requireObject(worktree, field);
    requireString(worktree.ticket, `${field}.ticket`);
    if (!ticketIds.includes(worktree.ticket)) {
      throw new DispatchArtifactError(`${field} references an unknown ticket`);
    }
    requireString(worktree.owner, `${field}.owner`);
    requireString(worktree.path, `${field}.path`);
    requireString(worktree.base, `${field}.base`);
    if (!/^[a-f0-9]{40}$/.test(worktree.base)) {
      throw new DispatchArtifactError(`${field}.base must be immutable`);
    }
    requireSequence(worktree.created_sequence, `${field}.created_sequence`);
    if (!['created', 'failed'].includes(worktree.creation_result)) {
      throw new DispatchArtifactError(`${field}.creation_result is invalid`);
    }
    requireString(worktree.lifecycle_state, `${field}.lifecycle_state`);
    requireObject(worktree.cleanup, `${field}.cleanup`);
    requireString(worktree.cleanup.decision, `${field}.cleanup.decision`);
    requireArray(
      worktree.cleanup.diagnostic_artifacts,
      `${field}.cleanup.diagnostic_artifacts`,
    );
    const lifecycle = lifecycles.get(worktree.ticket);
    if (worktree.creation_result === 'failed') {
      requireObject(worktree.isolation_check, `${field}.isolation_check`);
      requireString(
        worktree.isolation_check.evidence,
        `${field}.isolation_check.evidence`,
      );
      if (lifecycle
        || worktree.lifecycle_state !== 'creation-failed'
        || worktree.isolation_check.status !== 'not-created'
        || worktree.cleanup.diagnostic_artifacts.length === 0) {
        throw new DispatchArtifactError(
          `${field} must retain an isolated worktree creation failure`,
        );
      }
      requireString(
        worktree.frontier_calculation,
        `${field}.frontier_calculation`,
      );
      requireString(worktree.recovery_action, `${field}.recovery_action`);
      creationFailures.set(worktree.ticket, {
        frontierCalculation: worktree.frontier_calculation,
        sequence: worktree.created_sequence,
        action: worktree.recovery_action,
      });
    } else if (!lifecycle
      || worktree.created_sequence >= lifecycle.started_sequence) {
      throw new DispatchArtifactError(
        `${field} must exist before its ticket lifecycle starts`,
      );
    } else {
      requireObject(worktree.isolation_check, `${field}.isolation_check`);
      requireString(
        worktree.isolation_check.evidence,
        `${field}.isolation_check.evidence`,
      );
      if (worktree.isolation_check.status !== 'passed') {
        throw new DispatchArtifactError(
          `${field} lacks passing worktree isolation evidence`,
        );
      }
      createdTickets.push(worktree.ticket);
      if (lifecycle.state === 'completed'
        && worktree.lifecycle_state !== 'removed') {
        throw new DispatchArtifactError(
          `${field} must be removed after completed lifecycle work`,
        );
      } else if (lifecycle.state !== 'completed'
        && (!worktree.lifecycle_state.startsWith('retained-')
        || worktree.cleanup.diagnostic_artifacts.length === 0)) {
        throw new DispatchArtifactError(
          `${field} must preserve failure diagnostics for incomplete work`,
        );
      }
    }
    owners.push(worktree.owner);
    paths.push(worktree.path);
    worktreeTickets.push(worktree.ticket);
  }
  assertUnique(worktreeTickets, 'worktree ownership tickets');
  assertSameMembers(
    createdTickets,
    [...lifecycles.keys()],
    'worktree ownership lifecycle tickets',
  );
  assertUnique(owners, 'worktree ownership owners');
  assertUnique(paths, 'worktree ownership paths');
  return creationFailures;
}

function validateCompletionEvents(artifact, lifecycles) {
  requireArray(artifact.completion_events, 'completion events');
  const events = new Map();
  for (const [index, event] of artifact.completion_events.entries()) {
    const field = `completion events[${index}]`;
    requireObject(event, field);
    requireSequence(event.sequence, `${field}.sequence`);
    requireString(event.ticket, `${field}.ticket`);
    if (event.result_status !== 'complete'
      || event.authority !== 'reviewed-ticket') {
      throw new DispatchArtifactError(
        `${field} is not an authoritative reviewed-ticket completion`,
      );
    }
    if (events.has(event.ticket)) {
      throw new DispatchArtifactError('completion events contain duplicate tickets');
    }
    const lifecycle = lifecycles.get(event.ticket);
    if (!lifecycle
      || lifecycle.state !== 'completed'
      || lifecycleTerminalSequence(lifecycle) !== event.sequence) {
      throw new DispatchArtifactError(`${field} contradicts its ticket lifecycle`);
    }
    events.set(event.ticket, event);
  }
  assertSameMembers(
    [...events.keys()],
    completedTicketIds(lifecycles),
    'completion event identities',
  );
  return events;
}

function validateDependencyTransitions(artifact, sourceDag, completionEvents) {
  requireArray(artifact.dependency_transitions, 'dependency transitions');
  const transitions = new Map();
  for (const [index, transition] of artifact.dependency_transitions.entries()) {
    const field = `dependency transitions[${index}]`;
    requireObject(transition, field);
    requireSequence(transition.sequence, `${field}.sequence`);
    requireSequence(transition.completion_sequence, `${field}.completion_sequence`);
    requireString(transition.ticket, `${field}.ticket`);
    requireString(transition.dependency, `${field}.dependency`);
    const edge = dependencyKey(transition.ticket, transition.dependency);
    const sourceEdge = sourceDag.dependencies.find(
      ({ ticket, depends_on: dependency }) => (
        dependencyKey(ticket, dependency) === edge
      ),
    );
    if (!sourceEdge) {
      throw new DispatchArtifactError(`${field} is not in the source DAG`);
    }
    if (sourceEdge.initial_state === 'satisfied') {
      throw new DispatchArtifactError(`${field} repeats a pre-satisfied edge`);
    }
    if (transition.from !== 'open' || transition.to !== 'satisfied') {
      throw new DispatchArtifactError(`${field} has an invalid state transition`);
    }
    const completion = completionEvents.get(transition.dependency);
    if (!completion
      || completion.sequence !== transition.completion_sequence
      || transition.sequence <= completion.sequence) {
      throw new DispatchArtifactError(
        `${field} advances without an authoritative completion event`,
      );
    }
    if (transitions.has(edge)) {
      throw new DispatchArtifactError('dependency transitions contain duplicate edges');
    }
    transitions.set(edge, transition);
  }
  const expectedTransitions = sourceDag.dependencies
    .filter((edge) => (
      edge.initial_state === 'open'
      && completionEvents.has(edge.depends_on)
    ))
    .map(({ ticket, depends_on: dependency }) => (
      dependencyKey(ticket, dependency)
    ));
  assertSameMembers(
    [...transitions.keys()],
    expectedTransitions,
    'dependency transition identities',
  );
  return transitions;
}

function validateFrontiers(
  artifact,
  sourceDag,
  lifecycles,
  transitions,
  ticketStates,
  executorCapacity,
  collisionPairs,
  creationFailures,
) {
  requireArray(artifact.frontier_calculations, 'frontier calculations');
  const calculationsById = new Map();
  for (const [index, calculation] of artifact.frontier_calculations.entries()) {
    const field = `frontier calculations[${index}]`;
    requireObject(calculation, field);
    requireString(calculation.id, `${field}.id`);
    if (calculationsById.has(calculation.id)) {
      throw new DispatchArtifactError('frontier calculation identities must be unique');
    }
    calculationsById.set(calculation.id, calculation);
  }
  for (const [ticket, failure] of creationFailures) {
    const selection = calculationsById.get(failure.frontierCalculation);
    const nextSequence = artifact.frontier_calculations[
      artifact.frontier_calculations.indexOf(selection) + 1
    ]?.sequence ?? Number.POSITIVE_INFINITY;
    if (!selection
      || !selection.selected.includes(ticket)
      || failure.sequence <= selection.sequence
      || failure.sequence >= nextSequence) {
      throw new DispatchArtifactError(
        `worktree creation failure for "${ticket}" must follow its selecting frontier`,
      );
    }
  }
  for (const [index, calculation] of artifact.frontier_calculations.entries()) {
    const field = `frontier calculations[${index}]`;
    requireSequence(calculation.sequence, `${field}.sequence`);
    requireArray(calculation.selected, `${field}.selected`);
    const active = [...lifecycles.values()]
      .filter((lifecycle) => (
        lifecycle.started_sequence < calculation.sequence
        && lifecycleTerminalSequence(lifecycle) > calculation.sequence
      ))
      .map(({ ticket }) => ticket);
    const terminal = new Set(
      [
        ...[...ticketStates]
          .filter(([, state]) => state !== 'open')
          .map(([ticket]) => ticket),
        ...[...lifecycles.values()]
          .filter(
            (lifecycle) => lifecycleTerminalSequence(lifecycle) < calculation.sequence,
          )
          .map(({ ticket }) => ticket),
        ...[...creationFailures]
          .filter(([, failure]) => failure.sequence < calculation.sequence)
          .map(([ticket]) => ticket),
      ],
    );
    const eligible = sourceDag.tickets
      .filter((ticket) => (
        !terminal.has(ticket.id)
        && !active.includes(ticket.id)
        && ticket.dependencies.every((dependency) => {
          const sourceEdge = sourceDag.dependencies.find(
            ({ ticket: dependent, depends_on: prerequisite }) => (
              dependent === ticket.id && prerequisite === dependency
            ),
          );
          if (sourceEdge?.initial_state === 'satisfied') return true;
          const transition = transitions.get(dependencyKey(ticket.id, dependency));
          return transition && transition.sequence < calculation.sequence;
        })
      ))
      .map(({ id }) => id);
    assertSameMembers(calculation.active, active, `${field}.active`);
    assertSameMembers(calculation.eligible, eligible, `${field}.eligible`);
    const selected = [];
    for (const ticket of eligible) {
      if (active.length + selected.length >= executorCapacity) break;
      if (![...active, ...selected].some((other) => (
        ticketsCollide(ticket, other, collisionPairs)
      ))) {
        selected.push(ticket);
      }
    }
    try {
      assertSameMembers(calculation.selected, selected, `${field}.selected`);
    } catch {
      throw new DispatchArtifactError(
        `${field} violates executor capacity or collision scheduling`,
      );
    }
    requireArray(calculation.deferred, `${field}.deferred`);
    const deferredTickets = eligible.filter(
      (ticket) => !selected.includes(ticket),
    );
    assertSameMembers(
      calculation.deferred.map(({ ticket }) => ticket),
      deferredTickets,
      `${field}.deferred tickets`,
    );
    for (const deferred of calculation.deferred) {
      requireObject(deferred, `${field}.deferred entry`);
      const conflicts = [...active, ...selected].filter((ticket) => (
        ticketsCollide(deferred.ticket, ticket, collisionPairs)
      ));
      const expectedReason = conflicts.length > 0 ? 'collision' : 'capacity';
      if (deferred.reason !== expectedReason) {
        throw new DispatchArtifactError(
          `${field} has an invalid collision scheduling deferral`,
        );
      }
      assertSameMembers(
        deferred.conflicts_with,
        conflicts,
        `${field}.deferred conflicts`,
      );
    }
    const nextSequence = artifact.frontier_calculations[index + 1]?.sequence
      ?? Number.POSITIVE_INFINITY;
    const starts = [...lifecycles.values()]
      .filter(({ started_sequence: sequence }) => (
        sequence > calculation.sequence && sequence < nextSequence
      ))
      .map(({ ticket }) => ticket);
    const failedCreations = [...creationFailures]
      .filter(([, failure]) => failure.frontierCalculation === calculation.id)
      .map(([ticket]) => ticket);
    assertSameMembers(
      starts,
      calculation.selected.filter((ticket) => !failedCreations.includes(ticket)),
      `${field} starts`,
    );
  }
  for (const lifecycle of lifecycles.values()) {
    requireString(
      lifecycle.frontier_calculation,
      `ticket lifecycle "${lifecycle.ticket}" frontier calculation`,
    );
    const selection = calculationsById.get(lifecycle.frontier_calculation);
    const priorSelections = artifact.frontier_calculations.filter(
      (calculation) => (
        calculation.sequence < lifecycle.started_sequence
        && calculation.selected.includes(lifecycle.ticket)
      ),
    );
    if (!selection
      || selection.sequence >= lifecycle.started_sequence
      || !selection.selected.includes(lifecycle.ticket)
      || priorSelections.length !== 1
      || priorSelections[0].id !== lifecycle.frontier_calculation) {
      throw new DispatchArtifactError(
        `ticket "${lifecycle.ticket}" start must follow exactly one selecting frontier calculation`,
      );
    }
  }
}

function validateSynthesis(artifact, lifecycles, completionEvents) {
  requireArray(artifact.synthesis, 'frontier synthesis');
  const calculations = new Map(
    artifact.frontier_calculations.map((calculation) => [
      calculation.id,
      calculation,
    ]),
  );
  const synthesizedFrontiers = artifact.synthesis.map(
    ({ frontier_id: frontier }) => frontier,
  );
  assertUnique(synthesizedFrontiers, 'frontier synthesis unique frontier calculation');
  const synthesizedTickets = [];
  const systematicConcernIds = [];
  const unresolvedConcernIds = [];
  const ticketByEvidence = new Map();
  for (const [ticket, lifecycle] of lifecycles) {
    if (lifecycle.state !== 'completed') continue;
    for (const reference of [
      lifecycle.result.implementation_handoff,
      lifecycle.result.review_brief,
    ]) {
      const existingOwner = ticketByEvidence.get(reference);
      if (existingOwner && existingOwner !== ticket) {
        throw new DispatchArtifactError(
          `duplicate synthesis evidence ownership for "${reference}"`,
        );
      }
      ticketByEvidence.set(reference, ticket);
    }
  }
  const availableEvidence = {
    implementation_handoffs: new Set(),
    review_briefs: new Set(),
  };
  const evidenceNames = Object.keys(availableEvidence);
  let priorSynthesisSequence = 0;
  for (const [index, synthesis] of artifact.synthesis.entries()) {
    const field = `frontier synthesis[${index}]`;
    requireObject(synthesis, field);
    requireString(synthesis.frontier_id, `${field}.frontier_id`);
    requireSequence(synthesis.sequence, `${field}.sequence`);
    if (synthesis.sequence <= priorSynthesisSequence) {
      throw new DispatchArtifactError(
        `${field} must preserve synthesis event ordering`,
      );
    }
    priorSynthesisSequence = synthesis.sequence;
    requireArray(synthesis.tickets, `${field}.tickets`);
    requireObject(synthesis.inputs, `${field}.inputs`);
    requireArray(synthesis.concerns, `${field}.concerns`);
    requireArray(synthesis.recommendations, `${field}.recommendations`);
    const calculation = calculations.get(synthesis.frontier_id);
    if (!calculation) {
      throw new DispatchArtifactError(
        `${field} does not reference a unique frontier calculation`,
      );
    }
    const completedSelection = calculation.selected.filter(
      (ticket) => completionEvents.has(ticket),
    );
    assertSameMembers(
      synthesis.tickets,
      completedSelection,
      `${field}.completed tickets selected by its frontier calculation`,
    );
    for (const ticket of synthesis.tickets) {
      const completion = completionEvents.get(ticket);
      if (!completion || completion.sequence >= synthesis.sequence) {
        throw new DispatchArtifactError(
          `${field} must occur after all required completion events`,
        );
      }
    }
    const implementationHandoffs = synthesis.tickets.map(
      (ticket) => lifecycles.get(ticket)?.result.implementation_handoff,
    );
    const reviewBriefs = synthesis.tickets.map(
      (ticket) => lifecycles.get(ticket)?.result.review_brief,
    );
    assertSameMembers(
      synthesis.inputs.implementation_handoffs,
      implementationHandoffs,
      `${field}.inputs.implementation_handoffs`,
    );
    assertSameMembers(
      synthesis.inputs.review_briefs,
      reviewBriefs,
      `${field}.inputs.review_briefs`,
    );
    for (const evidenceName of evidenceNames) {
      for (const reference of synthesis.inputs[evidenceName]) {
        availableEvidence[evidenceName].add(reference);
      }
    }
    for (const [concernIndex, concern] of synthesis.concerns.entries()) {
      const concernField = `${field}.concerns[${concernIndex}]`;
      if (typeof concern === 'string') {
        throw new DispatchArtifactError(
          `${concernField} is not a systematic concern disposition`,
        );
      }
      requireObject(concern, concernField);
      requireString(concern.id, `${concernField}.id`);
      if (concern.scope !== 'cross-ticket'
        || !['resolved', 'unresolved'].includes(concern.status)
        || !['accept', 'fix', 'split', 'human-decision'].includes(
          concern.disposition,
        )) {
        throw new DispatchArtifactError(
          `${concernField} is not a systematic concern disposition`,
        );
      }
      requireObject(concern.evidence, `${concernField}.evidence`);
      for (const evidenceName of evidenceNames) {
        requireArray(
          concern.evidence[evidenceName],
          `${concernField}.evidence.${evidenceName}`,
        );
        if (concern.evidence[evidenceName].length === 0
          || concern.evidence[evidenceName].some(
            (reference) => !availableEvidence[evidenceName].has(reference),
          )) {
          throw new DispatchArtifactError(
            `${concernField} requires systematic concern evidence from synthesis inputs`,
          );
        }
      }
      const citedTickets = new Set([
        ...concern.evidence.implementation_handoffs,
        ...concern.evidence.review_briefs,
      ].map((reference) => ticketByEvidence.get(reference)));
      if (citedTickets.size < 2) {
        throw new DispatchArtifactError(
          `${concernField} must cite at least two distinct ticket identities`,
        );
      }
      systematicConcernIds.push(concern.id);
      if (concern.status === 'unresolved') unresolvedConcernIds.push(concern.id);
    }
    for (const recommendation of synthesis.recommendations) {
      requireString(recommendation, `${field}.recommendations`);
      if (!/^(?:accept|fix|split|human decision)\b/.test(recommendation)) {
        throw new DispatchArtifactError(
          `${field} contains an unsupported recommendation`,
        );
      }
    }
    synthesizedTickets.push(...synthesis.tickets);
  }
  const completedTickets = completedTicketIds(lifecycles);
  assertSameMembers(
    synthesizedTickets,
    completedTickets,
    'frontier synthesis ticket identities',
  );
  const completedTicketSet = new Set(completedTickets);
  const expectedFrontiers = artifact.frontier_calculations
    .filter(({ selected }) => (
      selected.length > 0
      && selected.some((ticket) => completedTicketSet.has(ticket))
    ))
    .map(({ id }) => id);
  assertSameMembers(
    synthesizedFrontiers,
    expectedFrontiers,
    'frontier synthesis unique frontier calculation',
  );
  assertUnique(systematicConcernIds, 'systematic concern identities');
  if (systematicConcernIds.length > 0
    || artifact.unresolved_systematic_concerns !== undefined) {
    try {
      assertSameMembers(
        artifact.unresolved_systematic_concerns,
        unresolvedConcernIds,
        'unresolved systematic concerns',
      );
    } catch {
      throw new DispatchArtifactError(
        'systematic concern state does not preserve unresolved concerns',
      );
    }
  }
}

function validateFinalState(
  artifact,
  sourceDag,
  ticketIds,
  ticketStates,
  lifecycles,
  transitions,
  creationFailures,
) {
  requireObject(artifact.final_state, 'final dispatch state');
  if (![
    'completed',
    'blocked',
    ...INCOMPLETE_LIFECYCLE_STATES,
  ].includes(
    artifact.final_state.status,
  )) {
    throw new DispatchArtifactError('final dispatch state is invalid');
  }
  for (const field of [
    'open_tickets',
    'active_tickets',
    'completed_tickets',
    'held_tickets',
    'blocked_tickets',
    'failed_tickets',
  ]) {
    requireArray(artifact.final_state[field], `final ${field}`);
    assertUnique(artifact.final_state[field], `final ${field}`);
  }
  for (const field of ['retryable_tickets', 'human_decision_tickets']) {
    if (artifact.final_state[field] === undefined) continue;
    requireArray(artifact.final_state[field], `final ${field}`);
    assertUnique(artifact.final_state[field], `final ${field}`);
  }
  const terminalState = new Map(ticketStates);
  for (const lifecycle of lifecycles.values()) {
    terminalState.set(lifecycle.ticket, lifecycle.state);
  }
  for (const ticket of creationFailures.keys()) {
    terminalState.set(ticket, 'retryable');
  }
  const expected = {
    completed_tickets: [],
    held_tickets: [],
    failed_tickets: [],
    retryable_tickets: [],
    human_decision_tickets: [],
  };
  for (const [ticket, state] of terminalState) {
    const bucket = TERMINAL_STATE_POLICY[state]?.bucket;
    if (bucket) expected[bucket].push(ticket);
  }
  for (const [field, values] of Object.entries(expected)) {
    assertSameMembers(
      artifact.final_state[field] ?? [],
      values,
      `final ${field}`,
    );
  }
  const terminalTickets = new Set(Object.values(expected).flat());
  const unresolvedTickets = ticketIds.filter(
    (ticket) => !terminalTickets.has(ticket),
  );
  const blockedTickets = unresolvedTickets.filter((ticket) => {
    const sourceTicket = sourceDag.tickets.find(({ id }) => id === ticket);
    return sourceTicket.dependencies.some((dependency) => {
      const edge = sourceDag.dependencies.find(
        ({ ticket: dependent, depends_on: prerequisite }) => (
          dependent === ticket && prerequisite === dependency
        ),
      );
      return edge.initial_state !== 'satisfied'
        && !transitions.has(dependencyKey(ticket, dependency));
    });
  });
  assertSameMembers(
    artifact.final_state.blocked_tickets,
    blockedTickets,
    'final blocked_tickets',
  );
  assertSameMembers(
    artifact.final_state.open_tickets,
    unresolvedTickets.filter((ticket) => !blockedTickets.includes(ticket)),
    'final open_tickets',
  );
  assertSameMembers(
    artifact.final_state.active_tickets,
    [],
    'final active_tickets',
  );
  const incomplete = expected.completed_tickets.length !== ticketIds.length;
  const expectedStatus = calculateFinalStatus(expected, ticketIds.length);
  if (artifact.final_state.status !== expectedStatus) {
    throw new DispatchArtifactError(
      'final dispatch status does not match retained ticket state',
    );
  }
  const recoveryActions = [
    ...sourceDag.tickets
      .filter(({ initial_state: state }) => (
        RETAINED_TERMINAL_STATES.includes(state)
      ))
      .map(({
        id: ticket,
        initial_state: state,
        initial_recovery: recovery,
      }) => ({
        ticket,
        state,
        sequence: recovery.sequence,
        action: recovery.action,
      })),
    ...[...lifecycles.values()]
      .filter(({ state }) => INCOMPLETE_LIFECYCLE_STATES.includes(state))
      .map((lifecycle) => ({
        ticket: lifecycle.ticket,
        state: lifecycle.state,
        sequence: lifecycleTerminalSequence(lifecycle),
        action: lifecycle.result.recovery_action,
      })),
    ...[...creationFailures].map(([ticket, failure]) => ({
      ticket,
      state: 'retryable',
      sequence: failure.sequence,
      action: failure.action,
    })),
  ].sort((left, right) => (
    left.sequence - right.sequence || left.ticket.localeCompare(right.ticket)
  ));
  if (incomplete) {
    if (recoveryActions.length === 0
      || artifact.final_state.first_recovery_action !== recoveryActions[0].action) {
      throw new DispatchArtifactError(
        'final state must retain the earliest retained recovery action',
      );
    }
  } else if (artifact.final_state.first_recovery_action !== null) {
    throw new DispatchArtifactError(
      'completed dispatch cannot retain a recovery action',
    );
  }
}

function validateFixtureReviewedTicket(reviewedTicket, lifecycle) {
  requireObject(reviewedTicket, 'fixture reviewed-ticket artifact');
  if (reviewedTicket.schema !== 'fixture-reviewed-ticket/v1'
    || reviewedTicket.status !== 'complete'
    || reviewedTicket.authority !== 'reviewed-ticket') {
    throw new DispatchArtifactError(
      'fixture reviewed-ticket artifact is not complete and authoritative',
    );
  }
  requireString(reviewedTicket.ticket, 'fixture reviewed-ticket ticket');
  if (!lifecycle || reviewedTicket.ticket !== lifecycle.ticket) {
    throw new DispatchArtifactError(
      'fixture reviewed-ticket identity does not match its selected ticket',
    );
  }
  requireObject(reviewedTicket.invocation, 'fixture reviewed-ticket invocation');
  requireObject(reviewedTicket.completion, 'fixture reviewed-ticket completion');
  if (reviewedTicket.invocation.ticket !== lifecycle.ticket
    || reviewedTicket.invocation.skill !== 'take-ticket'
    || reviewedTicket.invocation.status !== 'succeeded'
    || reviewedTicket.invocation.sequence !== lifecycle.started_sequence) {
    throw new DispatchArtifactError(
      'fixture reviewed-ticket invocation is not authoritative',
    );
  }
  if (reviewedTicket.completion.ticket !== lifecycle.ticket
    || reviewedTicket.completion.status !== 'complete'
    || reviewedTicket.completion.authority !== 'reviewed-ticket'
    || reviewedTicket.completion.sequence !== lifecycle.completed_sequence) {
    throw new DispatchArtifactError(
      'fixture reviewed-ticket completion is not authoritative',
    );
  }
  requireArray(reviewedTicket.phases, 'fixture reviewed-ticket phases');
  const expectedPhases = [
    'implementation',
    'full-review',
    'correction',
    'targeted-re-review',
  ];
  assertSameMembers(
    reviewedTicket.phases.map(({ name }) => name),
    expectedPhases,
    'fixture reviewed-ticket phases',
  );
  for (const [index, phase] of reviewedTicket.phases.entries()) {
    const field = `fixture reviewed-ticket phases[${index}]`;
    requireObject(phase, field);
    if (phase.name !== expectedPhases[index] || phase.status !== 'completed') {
      throw new DispatchArtifactError(`${field} is not complete and ordered`);
    }
    requireObject(phase.range, `${field}.range`);
    requireString(phase.range.base, `${field}.range.base`);
    requireString(phase.range.head, `${field}.range.head`);
    requireString(phase.artifact, `${field}.artifact`);
  }
  const correction = reviewedTicket.phases[2];
  const targetedReview = reviewedTicket.phases[3];
  if (correction.required !== true || targetedReview.required !== true) {
    throw new DispatchArtifactError(
      'fixture correction requires a targeted re-review',
    );
  }
  if (reviewedTicket.phases[0].artifact
      !== lifecycle.result.implementation_handoff
    || reviewedTicket.phases[1].artifact !== lifecycle.result.review_brief) {
    throw new DispatchArtifactError(
      'fixture reviewed-ticket phases contradict the dispatch lifecycle result',
    );
  }
  return reviewedTicket;
}

function validateTakeTicketToolUses(toolUses, selectedTickets) {
  if (toolUses.some(({ name }) => /^code-review(?:[.:]|$)/.test(name))) {
    throw new DispatchArtifactError(
      'dispatch evidence contains a duplicate per-ticket Code Review',
    );
  }
  const takeTicketTools = toolUses.filter(({ name }) => (
    /^take-ticket(?:[.:]|$)/.test(name)
  ));
  const expectedNames = new Set(selectedTickets.flatMap((ticket) => [
    `take-ticket.invoke:${ticket}`,
    `take-ticket.complete:${ticket}`,
  ]));
  const actualNames = new Set(takeTicketTools.map(({ name }) => name));
  const exactEventSet = takeTicketTools.length === expectedNames.size
    && actualNames.size === expectedNames.size
    && takeTicketTools.every(({ name, outcome }) => (
      expectedNames.has(name) && outcome === 'succeeded'
    ));
  if (!exactEventSet) {
    throw new DispatchArtifactError(
      'normalized result requires the exact Take Ticket tool event set',
    );
  }
  return true;
}

function runArtifactChecks(artifactChecks, checks) {
  requireArray(artifactChecks, 'artifact checks');
  assertUnique(artifactChecks, 'artifact checks');
  return artifactChecks.map((id) => {
    const check = checks[id];
    if (!check) {
      throw new DispatchArtifactError(`unknown artifact check "${id}"`);
    }
    if (!check()) {
      throw new DispatchArtifactError(`artifact check "${id}" failed`);
    }
    return { id, passed: true };
  });
}

function executeArtifactChecks(artifactChecks, evidence) {
  const {
    artifact,
    dispatchReference,
    observedLoads,
    result,
    reviewedTickets,
    selectedTickets,
  } = evidence;
  const checks = {
    authorization: () => (
      artifact.authorization.explicit === true
      && artifact.authorization.granted === true
    ),
    'frontier-causality': () => artifact.ticket_lifecycles.every(
      ({ frontier_calculation: calculation }) => (
        typeof calculation === 'string' && calculation.length > 0
      ),
    ),
    'reviewed-lifecycle': () => (
      reviewedTickets.length === selectedTickets.length
    ),
    'synthesis-timing': () => artifact.synthesis.every((synthesis) => (
      synthesis.tickets.every((ticket) => (
        artifact.completion_events.some((event) => (
          event.ticket === ticket && event.sequence < synthesis.sequence
        ))
      ))
    )),
    'replay-state': () => (
      artifact.final_state
      && typeof artifact.final_state.status === 'string'
    ),
    'moving-frontier': () => artifact.frontier_calculations.some(
      ({ active, selected }) => active.length > 0 && selected.length > 0,
    ),
    'observed-effects': () => (
      result.observations.toolUses.length > 0
      && result.observations.attemptedMutations.length > 0
    ),
    'observed-skill-loads': () => (
      observedLoads.length === result.observations.skillEvents.length
    ),
    'exact-take-ticket-tools': () => validateTakeTicketToolUses(
      result.observations.toolUses,
      selectedTickets,
    ),
    'observed-tools': () => result.observations.toolUses.length > 0,
    'observed-mutations': () => (
      result.observations.attemptedMutations.length > 0
    ),
    'retained-source-state': () => (
      typeof artifact.source_dag.identity === 'string'
      && artifact.source_dag.tickets.every(
        ({ initial_state: state }) => typeof state === 'string',
      )
    ),
    'retained-frontier-state': () => artifact.frontier_calculations.every(
      ({ id, selected }) => typeof id === 'string' && Array.isArray(selected),
    ),
    'retained-continuation-boundary': () => (
      typeof dispatchReference === 'string' && dispatchReference.length > 0
    ),
  };
  return runArtifactChecks(artifactChecks, checks);
}

function gradeDispatchResult(result, { resolveArtifact, artifactChecks }) {
  requireObject(result, 'normalized dispatch result');
  if (result.status !== 'succeeded' || typeof resolveArtifact !== 'function') {
    throw new DispatchArtifactError(
      'normalized dispatch result and artifact resolver are required',
    );
  }
  requireObject(result.observations, 'normalized dispatch observations');
  const observedLoads = result.observations.skillEvents.filter((event) => (
    event.operation === 'load'
    && event.status === 'succeeded'
    && event.provenance.statusSource === 'observed'
  ));
  if (observedLoads.length !== result.observations.skillEvents.length) {
    throw new DispatchArtifactError(
      'normalized Skill events must be observed successful load operations',
    );
  }
  if (!observedLoads.some(({ name }) => name === 'dispatch-work')
    || !observedLoads.some(({ name }) => name === 'take-ticket')) {
    throw new DispatchArtifactError(
      'normalized result lacks observed Dispatch Work and Take Ticket evidence',
    );
  }
  if (result.observations.attemptedMutations.length === 0) {
    throw new DispatchArtifactError(
      'normalized result lacks observed mutation evidence',
    );
  }
  const dispatchReference = result.observations.artifacts.find(
    ({ mediaType }) => mediaType === 'application/vnd.dispatch-work+json',
  )?.reference;
  const reviewedDescriptors = result.observations.artifacts.filter(
    ({ mediaType }) => mediaType === 'application/vnd.fixture-reviewed-ticket+json',
  );
  requireString(dispatchReference, 'normalized dispatch artifact reference');
  const artifact = validateDispatchArtifact(resolveArtifact(dispatchReference));
  const selectedTickets = artifact.frontier_calculations.flatMap(
    ({ selected }) => selected,
  );
  assertUnique(selectedTickets, 'selected ticket identities');
  validateTakeTicketToolUses(
    result.observations.toolUses,
    selectedTickets,
  );
  if (reviewedDescriptors.length !== selectedTickets.length) {
    throw new DispatchArtifactError(
      'normalized result requires one reviewed-ticket artifact per selected ticket',
    );
  }
  const lifecycles = new Map(
    artifact.ticket_lifecycles.map((lifecycle) => [
      lifecycle.ticket,
      lifecycle,
    ]),
  );
  const reviewedTickets = reviewedDescriptors.map(({ reference }) => {
    requireString(reference, 'normalized reviewed-ticket artifact reference');
    const reviewedTicket = resolveArtifact(reference);
    const lifecycle = lifecycles.get(reviewedTicket.ticket);
    return validateFixtureReviewedTicket(reviewedTicket, lifecycle);
  });
  assertSameMembers(
    reviewedTickets.map(({ ticket }) => ticket),
    selectedTickets,
    'reviewed-ticket artifact identities',
  );
  const checks = executeArtifactChecks(artifactChecks, {
    artifact,
    dispatchReference,
    observedLoads,
    result,
    reviewedTickets,
    selectedTickets,
  });
  return {
    artifact,
    checks,
    reviewedTickets,
  };
}

function gradeTakeItOfflineResult(result, { resolveArtifact, artifactChecks }) {
  requireObject(result, 'normalized Take It Offline result');
  if (result.status !== 'succeeded' || typeof resolveArtifact !== 'function') {
    throw new DispatchArtifactError(
      'normalized Take It Offline result and artifact resolver are required',
    );
  }
  requireObject(result.observations, 'normalized Take It Offline observations');
  const observedLoads = result.observations.skillEvents.filter((event) => (
    event.operation === 'load'
    && event.status === 'succeeded'
    && event.provenance.statusSource === 'observed'
  ));
  if (observedLoads.length !== result.observations.skillEvents.length
    || !observedLoads.some(({ name }) => name === 'take-it-offline')) {
    throw new DispatchArtifactError(
      'component requires an observed successful take-it-offline load',
    );
  }
  const offlineTools = result.observations.toolUses.filter(
    ({ name }) => name.startsWith('take-it-offline'),
  );
  if (offlineTools.length !== 1
    || offlineTools[0].name !== 'take-it-offline.create'
    || offlineTools[0].outcome !== 'succeeded') {
    throw new DispatchArtifactError(
      'component requires successful take-it-offline tool evidence',
    );
  }
  const dispatchReference = result.observations.artifacts.find(
    ({ mediaType }) => mediaType === 'application/vnd.dispatch-work+json',
  )?.reference;
  const continuationDescriptors = result.observations.artifacts.filter(
    ({ mediaType }) => mediaType === 'application/vnd.fixture-continuation+json',
  );
  requireString(dispatchReference, 'normalized dispatch artifact reference');
  if (continuationDescriptors.length !== 1) {
    throw new DispatchArtifactError(
      'component requires one Take It Offline continuation artifact',
    );
  }
  const continuationReference = continuationDescriptors[0].reference;
  requireString(
    continuationReference,
    'normalized continuation artifact reference',
  );
  const artifact = validateDispatchArtifact(resolveArtifact(dispatchReference));
  const continuation = resolveArtifact(continuationReference);
  requireObject(continuation, 'Take It Offline continuation artifact');
  if (continuation.schema !== 'fixture-continuation/v1'
    || continuation.owner !== 'take-it-offline'
    || continuation.dispatch_reference !== dispatchReference) {
    throw new DispatchArtifactError(
      'continuation artifact must be owned by Take It Offline and reference retained dispatch state',
    );
  }
  requireString(
    continuation.state_reference,
    'Take It Offline continuation state reference',
  );

  const checks = {
    'retained-source-state': () => (
      typeof artifact.source_dag.identity === 'string'
      && artifact.source_dag.tickets.every(
        ({ initial_state: state }) => typeof state === 'string',
      )
    ),
    'retained-frontier-state': () => artifact.frontier_calculations.every(
      ({ id, selected }) => typeof id === 'string' && Array.isArray(selected),
    ),
    'retained-continuation-boundary': () => (
      continuation.dispatch_reference === dispatchReference
      && continuation.state_reference.length > 0
    ),
    'observed-take-it-offline-load': () => observedLoads.some(
      ({ name }) => name === 'take-it-offline',
    ),
    'observed-take-it-offline-tool': () => offlineTools.length === 1,
  };
  return {
    artifact,
    checks: runArtifactChecks(artifactChecks, checks),
    continuation,
  };
}

function validateDispatchArtifact(artifact, { resolveArtifact } = {}) {
  requireObject(artifact, 'dispatch artifact');
  if (artifact.schema !== 'dispatch-work-artifact/v1') {
    throw new DispatchArtifactError('unsupported dispatch artifact schema');
  }
  for (const field of [
    'resume',
    'execution_context',
    'executor',
    'collision_constraints',
    'worktrees',
    'pr_maintenance',
    'unresolved_systematic_concerns',
  ]) {
    if (artifact[field] === undefined) {
      throw new DispatchArtifactError(
        `retained dispatch evidence requires ${field}`,
      );
    }
  }
  requireObject(artifact.authorization, 'dispatch artifact authorization');
  if (artifact.authorization.explicit !== true
    || artifact.authorization.granted !== true) {
    throw new DispatchArtifactError('explicit dispatch authorization is required');
  }
  requireString(artifact.authorization.source, 'dispatch authorization source');
  requireObject(artifact.source_dag, 'dispatch artifact source DAG');
  if (artifact.source_dag.published !== true
    || artifact.source_dag.ready !== true) {
    throw new DispatchArtifactError('published ready DAG is required');
  }
  const { ticketIds, ticketStates } = validateSourceDag(artifact.source_dag);
  validateExecutionContext(artifact.execution_context);
  validateResumeEvidence(
    artifact,
    ticketIds,
    ticketStates,
    resolveArtifact,
  );
  const executorCapacity = validateExecutorSelection(artifact);
  const collisionPairs = validateCollisionConstraints(artifact, ticketIds);
  validatePrMaintenance(artifact, ticketIds);
  const lifecycles = validateTicketLifecycles(
    artifact,
    ticketIds,
    ticketStates,
  );
  const creationFailures = validateWorktreeOwnership(
    artifact,
    lifecycles,
    ticketIds,
  );
  const completionEvents = validateCompletionEvents(artifact, lifecycles);
  const transitions = validateDependencyTransitions(
    artifact,
    artifact.source_dag,
    completionEvents,
  );
  validateFrontiers(
    artifact,
    artifact.source_dag,
    lifecycles,
    transitions,
    ticketStates,
    executorCapacity,
    collisionPairs,
    creationFailures,
  );
  validateSynthesis(artifact, lifecycles, completionEvents);
  validateFinalState(
    artifact,
    artifact.source_dag,
    ticketIds,
    ticketStates,
    lifecycles,
    transitions,
    creationFailures,
  );
  return artifact;
}

module.exports = {
  DispatchArtifactError,
  gradeDispatchResult,
  gradeTakeItOfflineResult,
  validateDispatchArtifact,
};
