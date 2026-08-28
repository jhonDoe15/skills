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
    if (!['open', 'completed', 'failed'].includes(ticket.initial_state)) {
      throw new DispatchArtifactError(
        `source DAG tickets[${index}].initial_state is invalid`,
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
    if (edge.initial_state === 'satisfied'
      && ticketStates.get(edge.depends_on) !== 'completed') {
      throw new DispatchArtifactError(
        `source DAG dependencies[${index}] is pre-satisfied without a completed dependency`,
      );
    }
    return dependencyKey(edge.ticket, edge.depends_on);
  });
  assertUnique(retainedEdges, 'source DAG dependencies');
  assertSameMembers(retainedEdges, declaredEdges, 'source DAG dependencies');
  assertAcyclic(sourceDag.tickets);
  return { ticketIds, ticketStates };
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
    } else if (['held', 'failed'].includes(lifecycle.state)) {
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
  return transitions;
}

function validateFrontiers(
  artifact,
  sourceDag,
  lifecycles,
  transitions,
  ticketStates,
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
  let movingFrontierObserved = false;
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
  if (artifact.frontier_calculations.length > 1 && !movingFrontierObserved) {
    throw new DispatchArtifactError(
      'no newly unblocked ticket starts while unrelated work remains active',
    );
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
  for (const [index, synthesis] of artifact.synthesis.entries()) {
    const field = `frontier synthesis[${index}]`;
    requireObject(synthesis, field);
    requireString(synthesis.frontier_id, `${field}.frontier_id`);
    requireSequence(synthesis.sequence, `${field}.sequence`);
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
    assertSameMembers(
      synthesis.tickets,
      calculation.selected,
      `${field}.tickets selected by its frontier calculation`,
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
      && selected.every((ticket) => completedTicketSet.has(ticket))
    ))
    .map(({ id }) => id);
  assertSameMembers(
    synthesizedFrontiers,
    expectedFrontiers,
    'frontier synthesis unique frontier calculation',
  );
}

function validateFinalState(
  artifact,
  sourceDag,
  ticketIds,
  ticketStates,
  lifecycles,
  transitions,
) {
  requireObject(artifact.final_state, 'final dispatch state');
  if (!['completed', 'held', 'blocked', 'failed'].includes(
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
  const terminalState = new Map(ticketStates);
  for (const lifecycle of lifecycles.values()) {
    terminalState.set(lifecycle.ticket, lifecycle.state);
  }
  const expected = {
    completed_tickets: [],
    held_tickets: [],
    failed_tickets: [],
  };
  for (const [ticket, state] of terminalState) {
    if (state === 'completed') expected.completed_tickets.push(ticket);
    if (state === 'held') expected.held_tickets.push(ticket);
    if (state === 'failed') expected.failed_tickets.push(ticket);
  }
  for (const [field, values] of Object.entries(expected)) {
    assertSameMembers(artifact.final_state[field], values, `final ${field}`);
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
  if (incomplete) {
    requireString(
      artifact.final_state.first_recovery_action,
      'final first_recovery_action',
    );
  } else if (artifact.final_state.first_recovery_action !== null) {
    throw new DispatchArtifactError(
      'completed dispatch cannot retain a recovery action',
    );
  }
}

function validateFixtureReviewedTicket(reviewedTicket) {
  requireObject(reviewedTicket, 'fixture reviewed-ticket artifact');
  if (reviewedTicket.schema !== 'fixture-reviewed-ticket/v1'
    || reviewedTicket.status !== 'complete'
    || reviewedTicket.authority !== 'reviewed-ticket') {
    throw new DispatchArtifactError(
      'fixture reviewed-ticket artifact is not complete and authoritative',
    );
  }
  requireString(reviewedTicket.ticket, 'fixture reviewed-ticket ticket');
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
  return reviewedTicket;
}

function gradeDispatchResult(result, { resolveArtifact }) {
  requireObject(result, 'normalized dispatch result');
  if (result.status !== 'succeeded' || typeof resolveArtifact !== 'function') {
    throw new DispatchArtifactError(
      'normalized dispatch result and artifact resolver are required',
    );
  }
  requireObject(result.observations, 'normalized dispatch observations');
  const observedLoads = result.observations.skillEvents.filter(
    ({ provenance }) => provenance.statusSource === 'observed',
  );
  if (!observedLoads.some(({ name }) => name === 'dispatch-work')
    || !observedLoads.some(({ name }) => name === 'take-ticket')) {
    throw new DispatchArtifactError(
      'normalized result lacks observed Dispatch Work and Take Ticket evidence',
    );
  }
  if (!result.observations.toolUses.some(
    ({ name, outcome }) => name === 'take-ticket.start' && outcome === 'succeeded',
  )) {
    throw new DispatchArtifactError(
      'normalized result lacks observed Take Ticket tool evidence',
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
  const reviewedReference = result.observations.artifacts.find(
    ({ mediaType }) => mediaType === 'application/vnd.fixture-reviewed-ticket+json',
  )?.reference;
  requireString(dispatchReference, 'normalized dispatch artifact reference');
  requireString(reviewedReference, 'normalized reviewed-ticket artifact reference');
  return {
    artifact: validateDispatchArtifact(resolveArtifact(dispatchReference)),
    reviewedTicket: validateFixtureReviewedTicket(
      resolveArtifact(reviewedReference),
    ),
  };
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
  const { ticketIds, ticketStates } = validateSourceDag(artifact.source_dag);
  const lifecycles = validateTicketLifecycles(
    artifact,
    ticketIds,
    ticketStates,
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
  );
  validateSynthesis(artifact, lifecycles, completionEvents);
  validateFinalState(
    artifact,
    artifact.source_dag,
    ticketIds,
    ticketStates,
    lifecycles,
    transitions,
  );
  return artifact;
}

module.exports = {
  DispatchArtifactError,
  gradeDispatchResult,
  validateDispatchArtifact,
};
