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
    if (ticket.initial_state === 'failed') {
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
  if (expected.failed_tickets.length > 0) return 'failed';
  if (expected.held_tickets.length > 0) return 'held';
  return 'blocked';
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
  const expectedStatus = calculateFinalStatus(expected, ticketIds.length);
  if (artifact.final_state.status !== expectedStatus) {
    throw new DispatchArtifactError(
      'final dispatch status does not match retained ticket state',
    );
  }
  const recoveryActions = [
    ...sourceDag.tickets
      .filter(({ initial_state: state }) => state === 'failed')
      .map(({ id: ticket, initial_recovery: recovery }) => ({
        ticket,
        state: 'failed',
        sequence: recovery.sequence,
        action: recovery.action,
      })),
    ...[...lifecycles.values()]
      .filter(({ state }) => ['held', 'failed'].includes(state))
      .map((lifecycle) => ({
        ticket: lifecycle.ticket,
        state: lifecycle.state,
        sequence: lifecycleTerminalSequence(lifecycle),
        action: lifecycle.result.recovery_action,
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
  gradeTakeItOfflineResult,
  validateDispatchArtifact,
};
