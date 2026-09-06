'use strict';

async function deliverEmail({ provider, recipient, subject, body }) {
  return provider.send({ recipient, subject, body });
}

module.exports = { deliverEmail };
