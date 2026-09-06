'use strict';

const {
  ImplementationOutcomeContractError,
  sealRecord,
  validateImplementationOutcomePlan,
  validateRunIndex,
} = require('./implementation-outcomes');

const TICKET_STAGES = Object.freeze([
  'planning',
  'implementation',
  'review-correction',
]);
const STAGE_CHECKPOINT_KIND = 'implementation-outcome-stage-checkpoint';

function noop() {}

function requireStageResult(result, coordinates) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ImplementationOutcomeContractError(
      `${coordinates.stage} executor must return an object`,
    );
  }
  if (!['executed', 'not-required'].includes(result.disposition)) {
    throw new ImplementationOutcomeContractError(
      `${coordinates.stage} executor disposition is invalid`,
    );
  }
  for (const name of ['inputFingerprint', 'outputFingerprint']) {
    if (typeof result[name] !== 'string'
      || !/^[a-f0-9]{64}$/.test(result[name])) {
      throw new ImplementationOutcomeContractError(
        `${coordinates.stage} executor ${name} must be a 64-hex digest`,
      );
    }
  }
  if (typeof result.evidencePointer !== 'string'
    || result.evidencePointer.length === 0
    || /[\r\n]/.test(result.evidencePointer)) {
    throw new ImplementationOutcomeContractError(
      `${coordinates.stage} executor evidencePointer is invalid`,
    );
  }
  return result;
}

function hasCheckpoint(index, coordinates) {
  return index.checkpoints.some((checkpoint) => (
    checkpoint.arm === coordinates.arm
      && checkpoint.stage === coordinates.stage
      && checkpoint.ticketId === coordinates.ticketId
  ));
}

function appendCheckpoint(index, coordinates, result) {
  const checkpoint = sealRecord({
    schemaVersion: 1,
    kind: STAGE_CHECKPOINT_KIND,
    pairFingerprint: coordinates.pairFingerprint,
    sequence: index.checkpoints.length + 1,
    arm: coordinates.arm,
    stage: coordinates.stage,
    ticketId: coordinates.ticketId,
    disposition: result.disposition,
    inputFingerprint: result.inputFingerprint,
    outputFingerprint: result.outputFingerprint,
    evidencePointer: result.evidencePointer,
  });
  return sealRecord({
    schemaVersion: 1,
    kind: index.kind,
    planFingerprint: index.planFingerprint,
    pairFingerprint: index.pairFingerprint,
    checkpoints: [...index.checkpoints, checkpoint],
    complete: false,
  });
}

function selectedTicketBatch(tickets, completed) {
  const eligible = tickets.filter((ticket) => (
    !completed.has(ticket.id)
    && ticket.blockers.every((blocker) => completed.has(blocker))
  ));
  const selected = [];
  const collisionResources = new Set();
  for (const ticket of eligible) {
    if (ticket.collisions.some((resource) => collisionResources.has(resource))) {
      continue;
    }
    selected.push(ticket);
    ticket.collisions.forEach((resource) => collisionResources.add(resource));
  }
  if (selected.length === 0 && completed.size < tickets.length) {
    throw new ImplementationOutcomeContractError(
      'ticket DAG cannot produce another executable frontier',
    );
  }
  return selected;
}

function stageCoordinates(pair, caseDefinition, arm, stage, ticket = null) {
  return Object.freeze({
    pairFingerprint: pair.fingerprint,
    caseId: caseDefinition.id,
    arm,
    stage,
    ticketId: ticket?.id ?? null,
    caseDefinition,
    ticket,
  });
}

async function executeMissingStage({
  index,
  coordinates,
  executeStage,
}) {
  if (hasCheckpoint(index, coordinates)) return null;
  const result = await executeStage(coordinates, index);
  return {
    coordinates,
    result: requireStageResult(result, coordinates),
  };
}

async function runParallelStage({
  index,
  pair,
  caseDefinition,
  arm,
  stage,
  tickets,
  executeStage,
  persist,
}) {
  const executions = await Promise.all(tickets.map((ticket) => (
    executeMissingStage({
      index,
      coordinates: stageCoordinates(
        pair,
        caseDefinition,
        arm,
        stage,
        ticket,
      ),
      executeStage,
    })
  )));
  let next = index;
  for (const execution of executions) {
    if (!execution) continue;
    next = appendCheckpoint(
      next,
      execution.coordinates,
      execution.result,
    );
    await persist(next);
  }
  return next;
}

async function runSingleStage({
  index,
  coordinates,
  executeStage,
  persist,
}) {
  const execution = await executeMissingStage({
    index,
    coordinates,
    executeStage,
  });
  if (!execution) return index;
  const next = appendCheckpoint(index, coordinates, execution.result);
  await persist(next);
  return next;
}

function mergedTickets(index, arm) {
  const merged = index.checkpoints.filter((checkpoint) => (
    checkpoint.arm === arm && checkpoint.stage === 'merge'
  ));
  return new Set(merged.map(({ ticketId }) => ticketId));
}

async function runArm({
  index,
  pair,
  caseDefinition,
  arm,
  executeStage,
  persist,
}) {
  let next = index;
  const completed = mergedTickets(next, arm);
  while (completed.size < caseDefinition.tickets.length) {
    const batch = selectedTicketBatch(caseDefinition.tickets, completed);
    for (const stage of TICKET_STAGES) {
      next = await runParallelStage({
        index: next,
        pair,
        caseDefinition,
        arm,
        stage,
        tickets: batch,
        executeStage,
        persist,
      });
    }
    for (const ticket of batch) {
      next = await runSingleStage({
        index: next,
        coordinates: stageCoordinates(
          pair,
          caseDefinition,
          arm,
          'merge',
          ticket,
        ),
        executeStage,
        persist,
      });
      completed.add(ticket.id);
    }
  }
  return runSingleStage({
    index: next,
    coordinates: stageCoordinates(
      pair,
      caseDefinition,
      arm,
      'verification',
    ),
    executeStage,
    persist,
  });
}

async function runPairWorkflow({
  plan,
  pair,
  index,
  executeStage,
  persist = noop,
}) {
  validateImplementationOutcomePlan(plan);
  validateRunIndex(index, plan, pair);
  if (typeof executeStage !== 'function' || typeof persist !== 'function') {
    throw new TypeError('runPairWorkflow requires executeStage and persist functions');
  }
  if (index.complete) return index;
  const caseDefinition = plan.cases.find(
    ({ id }) => id === pair.caseId,
  );
  if (!caseDefinition || caseDefinition.fingerprint !== pair.caseFingerprint) {
    throw new ImplementationOutcomeContractError(
      'pair case identity is stale or unknown',
    );
  }

  let next = await runSingleStage({
    index,
    coordinates: stageCoordinates(
      pair,
      caseDefinition,
      'common',
      'ticketing',
    ),
    executeStage,
    persist,
  });
  for (const arm of pair.armOrder) {
    next = await runArm({
      index: next,
      pair,
      caseDefinition,
      arm,
      executeStage,
      persist,
    });
  }
  next = await runSingleStage({
    index: next,
    coordinates: stageCoordinates(
      pair,
      caseDefinition,
      'pair',
      'grading',
    ),
    executeStage,
    persist,
  });
  next = sealRecord({
    ...next,
    complete: true,
  });
  await persist(next);
  return validateRunIndex(next, plan, pair);
}

module.exports = {
  runPairWorkflow,
  selectedTicketBatch,
};
