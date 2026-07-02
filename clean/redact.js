const SENSITIVE_KEY_RE = /authorization|cookie|token|access_token|api_key|catpawai_api_key/i;

function redactString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|token|authorization)=([^&\s]+)/gi, '$1=[REDACTED]');
}

function redactObject(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactObject);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactObject(item),
    ])
  );
}

module.exports = {
  redactObject,
  redactString,
};
