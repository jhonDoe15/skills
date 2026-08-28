'use strict';

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

function validateSourceDag(sourceDag) {
  requireString(sourceDag.identity, 'source DAG identity');
  requireArray(sourceDag.tickets, 'source DAG tickets');
  requireArray(sourceDag.dependencies, 'source DAG dependencies');
  const ticketIds = sourceDag.tickets.map((ticket, index) => {
    requireObject(ticket, `source DAG tickets[${index}]`);
    requireString(ticket.id, `source DAG tickets[${index}].id`);
    requireArray(ticket.dependencies, `source DAG tickets[${index}].dependencies`);
    assertUnique(ticket.dependencies, `source DAG tickets[${index}].dependencies`);
    return ticket.id;
  });
  assertUnique(ticketIds, 'source DAG ticket identities');
  const knownTickets = new Set(ticketIds);
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
    return dependencyKey(edge.ticket, edge.depends_on);
  });
  assertUnique(retainedEdges, 'source DAG dependencies');
  assertSameMembers(retainedEdges, declaredEdges, 'source DAG dependencies');
  return ticketIds;
}

function validateTicketLifecycles(artifact, ticketIds) {
  requireArray(artifact.ticket_lifecycles, 'ticket lifecycles');
  const lifecycles = new Map();
  for (const [index, lifecycle] of artifact.ticket_lifecycles.entries()) {
    const field = `ticket lifecycles[${index}]`;
    requireObject(lifecycle, field);
    requireString(lifecycle.ticket, `${field}.ticket`);
    requireString(lifecycle.state, `${field}.state`);
    requireSequence(lifecycle.started_sequence, `${field}.started_sequence`);
    requireSequence(lifecycle.completed_sequence, `${field}.completed_sequence`);
    if (lifecycle.started_sequence >= lifecycle.completed_sequence) {
      throw new DispatchArtifactError(`${field} completes before it starts`);
    }
    requireObject(lifecycle.result, `${field}.result`);
    if (lifecycle.state !== 'completed'
      || lifecycle.result.status !== 'complete'
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
    if (lifecycles.has(lifecycle.ticket)) {
      throw new DispatchArtifactError('ticket lifecycles contain duplicate tickets');
    }
    lifecycles.set(lifecycle.ticket, lifecycle);
  }
  assertSameMembers([...lifecycles.keys()], ticketIds, 'ticket lifecycle identities');
  return lifecycles;
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
    if (!lifecycle || lifecycle.completed_sequence !== event.sequence) {
      throw new DispatchArtifactError(`${field} contradicts its ticket lifecycle`);
    }
    events.set(event.ticket, event);
  }
  assertSameMembers(
    [...events.keys()],
    [...lifecycles.keys()],
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
  const sourceEdges = sourceDag.dependencies.map(
    ({ ticket, depends_on: dependency }) => dependencyKey(ticket, dependency),
  );
  assertSameMembers(
    [...transitions.keys()],
    sourceEdges,
    'dependency transition identities',
  );
  return transitions;
}

function validateFrontiers(artifact, sourceDag, lifecycles, transitions) {
  requireArray(artifact.frontier_calculations, 'frontier calculations');
  let movingFrontierObserved = false;
  for (const [index, calculation] of artifact.frontier_calculations.entries()) {
    const field = `frontier calculations[${index}]`;
    requireObject(calculation, field);
    requireSequence(calculation.sequence, `${field}.sequence`);
    requireArray(calculation.selected, `${field}.selected`);
    const active = [...lifecycles.values()]
      .filter((lifecycle) => (
        lifecycle.started_sequence < calculation.sequence
        && lifecycle.completed_sequence > calculation.sequence
      ))
      .map(({ ticket }) => ticket);
    const completed = new Set(
      [...lifecycles.values()]
        .filter(({ completed_sequence: sequence }) => sequence < calculation.sequence)
        .map(({ ticket }) => ticket),
    );
    const eligible = sourceDag.tickets
      .filter((ticket) => (
        !completed.has(ticket.id)
        && !active.includes(ticket.id)
        && ticket.dependencies.every((dependency) => {
          const transition = transitions.get(dependencyKey(ticket.id, dependency));
          return transition && transition.sequence < calculation.sequence;
        })
      ))
      .map(({ id }) => id);
    assertSameMembers(calculation.active, active, `${field}.active`);
    assertSameMembers(calculation.eligible, eligible, `${field}.eligible`);
    assertSameMembers(calculation.selected, eligible, `${field}.selected`);
    const nextSequence = artifact.frontier_calculations[index + 1]?.sequence
      ?? Number.POSITIVE_INFINITY;
    const starts = [...lifecycles.values()]
      .filter(({ started_sequence: sequence }) => (
        sequence > calculation.sequence && sequence < nextSequence
      ))
      .map(({ ticket }) => ticket);
    assertSameMembers(starts, calculation.selected, `${field} starts`);
    if (active.length > 0 && calculation.selected.length > 0) {
      movingFrontierObserved = true;
    }
  }
  if (!movingFrontierObserved) {
    throw new DispatchArtifactError(
      'no newly unblocked ticket starts while unrelated work remains active',
    );
  }
}

function validateSynthesis(artifact, lifecycles) {
  requireArray(artifact.synthesis, 'frontier synthesis');
  const synthesizedTickets = [];
  for (const [index, synthesis] of artifact.synthesis.entries()) {
    const field = `frontier synthesis[${index}]`;
    requireObject(synthesis, field);
    requireString(synthesis.frontier_id, `${field}.frontier_id`);
    requireArray(synthesis.tickets, `${field}.tickets`);
    requireObject(synthesis.inputs, `${field}.inputs`);
    requireArray(synthesis.concerns, `${field}.concerns`);
    requireArray(synthesis.recommendations, `${field}.recommendations`);
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
  assertSameMembers(
    synthesizedTickets,
    [...lifecycles.keys()],
    'frontier synthesis ticket identities',
  );
}

function validateFinalState(artifact, ticketIds) {
  requireObject(artifact.final_state, 'final dispatch state');
  if (artifact.final_state.status !== 'completed') {
    throw new DispatchArtifactError('final dispatch state is not completed');
  }
  assertSameMembers(artifact.final_state.open_tickets, [], 'final open tickets');
  assertSameMembers(artifact.final_state.active_tickets, [], 'final active tickets');
  assertSameMembers(
    artifact.final_state.completed_tickets,
    ticketIds,
    'final completed tickets',
  );
}

function validateDispatchArtifact(artifact) {
  requireObject(artifact, 'dispatch artifact');
  if (artifact.schema !== 'dispatch-work-artifact/v1') {
    throw new DispatchArtifactError('unsupported dispatch artifact schema');
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
  const ticketIds = validateSourceDag(artifact.source_dag);
  const lifecycles = validateTicketLifecycles(artifact, ticketIds);
  const completionEvents = validateCompletionEvents(artifact, lifecycles);
  const transitions = validateDependencyTransitions(
    artifact,
    artifact.source_dag,
    completionEvents,
  );
  validateFrontiers(artifact, artifact.source_dag, lifecycles, transitions);
  validateSynthesis(artifact, lifecycles);
  validateFinalState(artifact, ticketIds);
  return artifact;
}

module.exports = {
  DispatchArtifactError,
  validateDispatchArtifact,
};
