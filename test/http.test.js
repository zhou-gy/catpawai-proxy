const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');
const { createApp } = require('../clean/app');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(server, path, options = {}) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}${path}`, options);
}

test('health returns catpawai discovery', async () => {
  const app = createApp({ env: { CATPAWAI_CLI_PATH: 'D:\\Programs\\CatPawAI\\bin\\catpawai.cmd' } });
  const server = await listen(app);
  try {
    const response = await request(server, '/health');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.name, 'catpawai-proxy');
    assert.equal(typeof body.catpawai.cliExists, 'boolean');
  } finally {
    server.close();
  }
});

test('models endpoint returns CatPawAI models', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const response = await request(server, '/v1/models');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.object, 'list');
    assert.equal(body.data.some((model) => model.id === 'deepseek-v3.2'), true);
    assert.equal(body.data.some((model) => model.id === 'glm-5'), true);
    assert.equal(body.data.some((model) => model.id === 'catpawai'), true);
  } finally {
    server.close();
  }
});

test('diagnostics explains missing explicit upstream', async () => {
  const app = createApp({ env: {} });
  const server = await listen(app);
  try {
    const response = await request(server, '/diagnostics');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.match(body.nextStep, /CATPAWAI_OPENAI_BASE_URL/);
    assert.equal(Array.isArray(body.catpawai.findings), true);
  } finally {
    server.close();
  }
});

test('diagnostics reports missing CatPaw token in catpaw auth mode', async () => {
  const app = createApp({
    env: {
      CATPAWAI_OPENAI_BASE_URL: 'https://catpaw.meituan.com/api/gpt',
      CATPAWAI_AUTH_MODE: 'catpaw',
    },
  });
  const server = await listen(app);
  try {
    const response = await request(server, '/diagnostics');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.catpawai.catpawTokenConfigured, false);
    assert.match(body.nextStep, /CATPAWAI_ACCESS_TOKEN/);
  } finally {
    server.close();
  }
});

test('diagnostics is ok with CatPaw token configured', async () => {
  const app = createApp({
    env: {
      CATPAWAI_OPENAI_BASE_URL: 'https://catpaw.meituan.com/api/gpt',
      CATPAWAI_AUTH_MODE: 'catpaw',
      CATPAWAI_ACCESS_TOKEN: 'token-123',
    },
  });
  const server = await listen(app);
  try {
    const response = await request(server, '/diagnostics');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.catpawai.catpawTokenConfigured, true);
  } finally {
    server.close();
  }
});

test('chat endpoint validates messages', async () => {
  const app = createApp();
  const server = await listen(app);
  try {
    const response = await request(server, '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'catpawai', messages: [] }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'invalid_messages');
  } finally {
    server.close();
  }
});

test('chat endpoint streams upstream SSE result', async () => {
  const catpawaiClient = {
    createChatCompletionStream: async () => ({
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: Readable.toWeb(Readable.from(['data: {"delta":"OK"}\n\n', 'data: [DONE]\n\n'])),
    }),
    createChatCompletion: async () => {
      throw new Error('non-stream path should not run');
    },
    discoverCatPawAi: () => ({ cliExists: true }),
  };
  const app = createApp({ catpawaiClient });
  const server = await listen(app);
  try {
    const response = await request(server, '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'catpawai', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    assert.match(body, /"delta":"OK"/);
    assert.match(body, /\[DONE\]/);
  } finally {
    server.close();
  }
});

test('chat endpoint returns upstream result', async () => {
  const catpawaiClient = {
    createChatCompletion: async () => ({
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
    }),
    discoverCatPawAi: () => ({ cliExists: true }),
  };
  const app = createApp({ catpawaiClient });
  const server = await listen(app);
  try {
    const response = await request(server, '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'catpawai', messages: [{ role: 'user', content: 'hi' }] }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.choices[0].message.content, 'OK');
  } finally {
    server.close();
  }
});

test('chat endpoint passes tool fields to client', async () => {
  let capturedRequest;
  const catpawaiClient = {
    createChatCompletion: async (request) => {
      capturedRequest = request;
      return {
        id: 'chatcmpl-tools',
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
      };
    },
    discoverCatPawAi: () => ({ cliExists: true }),
  };
  const app = createApp({ catpawaiClient });
  const server = await listen(app);
  const tools = [
    {
      type: 'function',
      function: {
        name: 'Bash',
        description: 'Run a shell command',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    },
  ];
  try {
    const response = await request(server, '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'catpawai',
        messages: [{ role: 'user', content: 'list files' }],
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(capturedRequest.tools, tools);
    assert.equal(capturedRequest.tool_choice, 'auto');
    assert.equal(capturedRequest.parallel_tool_calls, false);
  } finally {
    server.close();
  }
});
