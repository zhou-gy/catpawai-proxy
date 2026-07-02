const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { AppError } = require('../clean/errors');
const { createCatPawCrypto } = require('../clean/catpaw-crypto');
const {
  buildCatPawHeaders,
  buildCatPawNativePayload,
  buildRequestHeaders,
  buildUpstreamPayload,
  createChatCompletion,
  discoverCatPawAi,
  normalizeBaseUrl,
} = require('../clean/catpawai-client');

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test('normalizeBaseUrl trims trailing slashes', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8080/v1///'), 'http://127.0.0.1:8080/v1');
});

test('discoverCatPawAi reports configured CLI path', () => {
  const result = discoverCatPawAi({
    CATPAWAI_CLI_PATH: 'D:\\Programs\\CatPawAI\\bin\\catpawai.cmd',
  });
  assert.equal(result.configuredCliPath.endsWith('catpawai.cmd'), true);
});

test('buildUpstreamPayload preserves messages and concrete model', () => {
  const payload = buildUpstreamPayload({
    model: 'deepseek-v3.2',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
  });
  assert.equal(payload.model, 'deepseek-v3.2');
  assert.deepEqual(payload.messages, [{ role: 'user', content: 'hi' }]);
  assert.equal(payload.stream, false);
});

test('buildCatPawNativePayload maps OpenAI messages to CatPaw chat shape', () => {
  const payload = buildCatPawNativePayload({
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(payload.triggerMode, 'VSCode.Chat');
  assert.equal(payload.messages[0].content, 'hi');
  assert.equal(payload.messages[0].triggerMode, 'VSCode.Chat');
});

test('buildCatPawHeaders creates CatPaw authentication headers', () => {
  const headers = buildCatPawHeaders({
    CATPAWAI_ACCESS_TOKEN: 'token-123',
    CATPAWAI_MIS_ID: 'user-a',
    CATPAWAI_TENANT: '5282fa6645',
  });

  assert.equal(headers['Catpaw-Auth'], 'token-123');
  assert.equal(headers['user-mis-id'], 'user-a');
  assert.equal(headers.tenant, '5282fa6645');
  assert.equal(headers['client-env'], 'LOCAL_IDE');
  assert.equal(headers['plugin-id'], 'mt-idekit.mt-idekit-code');
  assert.equal(Boolean(headers['platform-info']), true);
  assert.match(headers.Cookie, /1d47d6ff96_passportid=token-123/);
  assert.match(headers.Cookie, /f32a546874_ssoid=token-123/);
});

test('buildRequestHeaders preserves Bearer mode by default', () => {
  const headers = buildRequestHeaders({ CATPAWAI_API_KEY: 'secret' });
  assert.equal(headers.Authorization, 'Bearer secret');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('createChatCompletion fails clearly without configured upstream', async () => {
  await assert.rejects(
    () =>
      createChatCompletion({
        model: 'catpawai',
        messages: [{ role: 'user', content: 'hi' }],
        env: {},
      }),
    (error) =>
      error instanceof AppError &&
      error.code === 'catpawai_chat_backend_unavailable' &&
      /does not expose/.test(error.message)
  );
});

test('createChatCompletion calls configured upstream', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1,
        model: 'catpawai',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'OK' },
            finish_reason: 'stop',
          },
        ],
      });
  };

  const result = await createChatCompletion({
    model: 'catpawai',
    messages: [{ role: 'user', content: 'hi' }],
    env: {
      CATPAWAI_OPENAI_BASE_URL: 'http://127.0.0.1:8888/v1',
      CATPAWAI_API_KEY: 'secret',
    },
    fetchImpl,
  });

  assert.equal(result.choices[0].message.content, 'OK');
  assert.equal(calls[0].url, 'http://127.0.0.1:8888/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
});

test('createChatCompletion calls CatPaw native stream endpoint and aggregates chunks', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const text = [
      'data: {"id":"chatcmpl-cp","object":"chat.completion.chunk","created":1,"model":"deepseek-v3.2","content":"O","choices":[{"index":"0","delta":{"content":"O"}}]}',
      '',
      'data: {"id":"chatcmpl-cp","object":"chat.completion.chunk","created":1,"model":"deepseek-v3.2","content":"OK","finishReason":"stop","choices":[{"index":"0","delta":{"content":"K"}}]}',
      '',
    ].join('\n');
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      text: async () => text,
    };
  };

  const result = await createChatCompletion({
    model: 'deepseek-v3.2',
    messages: [{ role: 'user', content: 'hi' }],
    env: {
      CATPAWAI_OPENAI_BASE_URL: 'https://catpaw.meituan.com/api/gpt',
      CATPAWAI_AUTH_MODE: 'catpaw',
      CATPAWAI_ACCESS_TOKEN: 'token-123',
      CATPAWAI_MIS_ID: 'user-a',
      CATPAWAI_ENCRYPTION: 'false',
    },
    fetchImpl,
  });

  assert.equal(result.choices[0].message.content, 'OK');
  assert.equal(result.choices[0].finish_reason, 'stop');
  assert.equal(calls[0].url, 'https://catpaw.meituan.com/api/gpt/openai/stream');
  assert.equal(calls[0].options.headers['Catpaw-Auth'], 'token-123');
  assert.equal(calls[0].options.headers['mis-id'], 'user-a');
  assert.equal(calls[0].options.headers.Accept, 'text/event-stream');
});

test('CatPaw crypto encrypts requests and decrypts responses', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const catpawCrypto = createCatPawCrypto({ publicKey, privateKey });
  const headers = {};
  const encrypted = catpawCrypto.encryptRequest(JSON.stringify({ message: 'hello' }), headers);

  assert.equal(typeof encrypted, 'string');
  assert.equal(typeof headers['encrypted-key'], 'string');
  assert.deepEqual(catpawCrypto.decryptResponse(encrypted, headers), { message: 'hello' });
});
