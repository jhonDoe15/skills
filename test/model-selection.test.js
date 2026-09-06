'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  formatModelSelection,
  modelSelectionFingerprint,
  modelSelectionsEqual,
  normalizeModelIdentity,
  normalizeModelSelection,
} = require('../suite/model-selection');
const { validateInvocation } = require('../suite');

function selection(value = 'high') {
  return {
    id: 'cursor-luna-shaped-model',
    params: [
      { id: 'max_mode', value: 'false' },
      { id: 'reasoning_effort', value },
    ],
  };
}

test('normalizes model parameters in deterministic ID order', () => {
  const forward = selection();
  const reversed = {
    id: forward.id,
    params: [...forward.params].reverse(),
  };

  assert.deepEqual(normalizeModelSelection(forward), {
    id: forward.id,
    params: [
      { id: 'max_mode', value: 'false' },
      { id: 'reasoning_effort', value: 'high' },
    ],
  });
  assert.equal(modelSelectionsEqual(forward, reversed), true);
  assert.equal(
    modelSelectionFingerprint(forward),
    modelSelectionFingerprint(reversed),
  );
  assert.equal(
    formatModelSelection(forward),
    'cursor-luna-shaped-model[max_mode=false,reasoning_effort=high]',
  );
});

test('model parameter values participate in structural identity', () => {
  assert.equal(modelSelectionsEqual(selection('high'), selection('low')), false);
  assert.notEqual(
    modelSelectionFingerprint(selection('high')),
    modelSelectionFingerprint(selection('low')),
  );
});

test('rejects malformed, aliased, duplicate, and non-exact selections', () => {
  const invalid = [
    'cursor-luna-shaped-model',
    { id: 'latest', params: [] },
    { id: 'model-latest', params: [] },
    { id: ' model-id', params: [] },
    { id: 'model\nid', params: [] },
    { id: 'model-id' },
    { id: 'model-id', params: [], effort: 'high' },
    {
      id: 'model-id',
      params: [
        { id: 'effort', value: 'high' },
        { id: 'effort', value: 'low' },
      ],
    },
    {
      id: 'model-id',
      params: [{ id: 'reasoning effort', value: 'high' }],
    },
    {
      id: 'model-id',
      params: [{ id: 'effort', value: ' high' }],
    },
  ];

  for (const value of invalid) {
    assert.throws(() => normalizeModelSelection(value));
  }
});

test('accepts exact model IDs without a digit', () => {
  assert.deepEqual(normalizeModelSelection({
    id: 'cursor-terra-shaped-model',
    params: [],
  }), {
    id: 'cursor-terra-shaped-model',
    params: [],
  });
});

test('production invocation canonicalizes and freezes nested model data', () => {
  const invocation = validateInvocation({
    requestId: 'structured-model',
    skill: 'agent-writing',
    prompt: 'Create one bounded artifact.',
    model: selection(),
  });

  assert.equal(Object.isFrozen(invocation), true);
  assert.equal(Object.isFrozen(invocation.model), true);
  assert.equal(Object.isFrozen(invocation.model.params), true);
  assert.equal(Object.isFrozen(invocation.model.params[0]), true);
  assert.throws(() => {
    invocation.model.params[0].value = 'low';
  }, TypeError);
});

test('model identity rejects contradictory verification states', () => {
  const requested = selection();
  const cases = [
    {
      requested,
      resolved: null,
      verification: {
        status: 'verified',
        source: 'test',
        reason: null,
        catalogEntryFingerprint: null,
      },
    },
    {
      requested,
      resolved: selection('low'),
      verification: {
        status: 'verified',
        source: 'test',
        reason: null,
        catalogEntryFingerprint: null,
      },
    },
    {
      requested,
      resolved: requested,
      verification: {
        status: 'mismatch',
        source: 'test',
        reason: 'different-model',
        catalogEntryFingerprint: null,
      },
    },
    {
      requested,
      resolved: null,
      verification: {
        status: 'unavailable',
        source: 'test',
        reason: null,
        catalogEntryFingerprint: null,
      },
    },
  ];

  for (const identity of cases) {
    assert.throws(() => normalizeModelIdentity(identity));
  }
});
