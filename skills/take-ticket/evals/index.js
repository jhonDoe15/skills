'use strict';

const { loadDefinitions } = require('./definitions');
const { gradeTakeTicketResult } = require('./grader');
const {
  TakeTicketEvaluationError,
  validateTakeTicketResult,
} = require('./lifecycle');

module.exports = {
  TakeTicketEvaluationError,
  gradeTakeTicketResult,
  loadDefinitions,
  validateTakeTicketResult,
};
