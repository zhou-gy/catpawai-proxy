const { redactString } = require('./redact');

function log(message) {
  const line = typeof message === 'string' ? message : JSON.stringify(message);
  console.log(`[catpawai-proxy] ${redactString(line)}`);
}

function error(message) {
  const line = typeof message === 'string' ? message : JSON.stringify(message);
  console.error(`[catpawai-proxy] ${redactString(line)}`);
}

module.exports = {
  error,
  log,
};
