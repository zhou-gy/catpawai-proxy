const test = require('node:test');
const assert = require('node:assert/strict');
const { redactObject, redactString } = require('../clean/redact');

test('redacts bearer tokens in strings', () => {
  assert.equal(redactString('Authorization: Bearer abc.def'), 'Authorization: Bearer [REDACTED]');
});

test('redacts sensitive object keys', () => {
  assert.deepEqual(redactObject({ CATPAWAI_API_KEY: 'secret', ok: 'yes' }), {
    CATPAWAI_API_KEY: '[REDACTED]',
    ok: 'yes',
  });
});
