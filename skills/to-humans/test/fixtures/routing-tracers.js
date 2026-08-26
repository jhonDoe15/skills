'use strict';

const PRIMARY_TRACER_NAMES = [
  'agent-writing',
  'engineering-guidance',
  'skill-writing',
  'take-it-offline',
];

const SUPPORT_TRACER_NAMES = [
  'skill-evaluation',
  'skill-mechanics',
];

const ROUTING_TRACES = {
  'ordinary-human-reply': {
    invokedSkills: ['writing-foundation', 'to-humans'],
    deliverables: [
      {
        id: 'reply',
        primary_reader: 'human',
        outcomes: ['to-humans'],
      },
    ],
  },
  'requested-prose': {
    invokedSkills: ['writing-foundation', 'to-humans'],
    deliverables: [
      {
        id: 'project-update',
        primary_reader: 'human',
        outcomes: ['to-humans'],
      },
    ],
  },
  'canonical-direct': {
    invokedSkills: ['writing-foundation', 'to-humans'],
    deliverables: [
      {
        id: 'sponsor-note',
        primary_reader: 'human',
        outcomes: ['to-humans'],
      },
    ],
  },
  'human-engineering-guidance': {
    invokedSkills: [
      'engineering-guidance',
      'writing-foundation',
      'to-humans',
    ],
    deliverables: [
      {
        id: 'guidance',
        primary_reader: 'human',
        outcomes: ['engineering-guidance', 'to-humans'],
      },
    ],
  },
  'agent-handoff': {
    invokedSkills: [
      'writing-foundation',
      'agent-writing',
      'take-it-offline',
    ],
    deliverables: [
      {
        id: 'handoff',
        primary_reader: 'agent',
        outcomes: ['take-it-offline'],
      },
    ],
  },
  'agent-skill-package': {
    invokedSkills: [
      'writing-foundation',
      'agent-writing',
      'skill-evaluation',
      'skill-mechanics',
      'skill-writing',
    ],
    deliverables: [
      {
        id: 'skill-package',
        primary_reader: 'agent',
        outcomes: ['skill-writing'],
      },
    ],
  },
  'mixed-reader-deliverables': {
    invokedSkills: [
      'writing-foundation',
      'to-humans',
      'agent-writing',
      'take-it-offline',
    ],
    deliverables: [
      {
        id: 'status',
        primary_reader: 'human',
        outcomes: ['to-humans'],
      },
      {
        id: 'handoff',
        primary_reader: 'agent',
        outcomes: ['take-it-offline'],
      },
    ],
  },
  'ambiguous-reader': {
    invokedSkills: ['writing-foundation', 'to-humans'],
    deliverables: [
      {
        id: 'clarification',
        primary_reader: 'human',
        outcomes: ['to-humans'],
      },
    ],
  },
  'non-prose-false-activation': {
    invokedSkills: [],
    deliverables: [
      {
        id: 'json-result',
        primary_reader: 'machine',
        outcomes: [],
      },
    ],
  },
  'private-dependency-false-activation': {
    invokedSkills: [],
    deliverables: [
      {
        id: 'identifier',
        primary_reader: 'machine',
        outcomes: [],
      },
    ],
  },
};

function tracerSkillDocument(name) {
  return [
    '---',
    `name: ${name}`,
    `description: Test-only ${PRIMARY_TRACER_NAMES.includes(name) ? 'Primary' : 'dependency'} selection tracer.`,
    '---',
    '',
    `# ${name}`,
    '',
    'Record selection only. Define no production behavior.',
    '',
  ].join('\n');
}

function routingTraceFor(caseId) {
  const trace = ROUTING_TRACES[caseId];
  if (!trace) throw new TypeError(`missing routing trace for "${caseId}"`);
  return structuredClone(trace);
}

module.exports = {
  PRIMARY_TRACER_NAMES,
  SUPPORT_TRACER_NAMES,
  routingTraceFor,
  tracerSkillDocument,
};
