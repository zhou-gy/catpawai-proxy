const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  anthropicRequestToChat,
  convertAnthropicToolChoice,
  estimateTokensFromText,
  openAiCompletionToAnthropicMessage,
  openAiCompletionToAnthropicSse,
} = require('../clean/anthropic-adapter');
const { createApp } = require('../clean/app');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('anthropicRequestToChat maps system tools and tool_choice', () => {
  const chat = anthropicRequestToChat({
    model: 'glm-5.2',
    max_tokens: 128,
    system: 'You are helpful.',
    tool_choice: { type: 'any' },
    tools: [{ name: 'Bash', description: 'Run shell', input_schema: { type: 'object' } }],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'list files' }],
      },
    ],
  });
  assert.equal(chat.model, 'glm-5.2');
  assert.equal(chat.max_tokens, 128);
  assert.equal(chat.tool_choice, 'required');
  assert.equal(chat.messages[0].role, 'system');
  assert.equal(chat.messages[1].content, 'list files');
  assert.equal(chat.tools[0].function.name, 'Bash');
});

test('convertAnthropicToolChoice maps tool name', () => {
  assert.deepEqual(convertAnthropicToolChoice({ type: 'tool', name: 'Read' }), {
    type: 'function',
    function: { name: 'Read' },
  });
});

test('openAiCompletionToAnthropicMessage maps tool_calls', () => {
  const message = openAiCompletionToAnthropicMessage(
    {
      id: 'chatcmpl-1',
      model: 'glm-5.2',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'Bash', arguments: '{"command":"ls"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
    'glm-5.2'
  );
  assert.equal(message.stop_reason, 'tool_use');
  assert.equal(message.content[0].type, 'tool_use');
  assert.equal(message.content[0].name, 'Bash');
  assert.deepEqual(message.content[0].input, { command: 'ls' });
});

test('openAiCompletionToAnthropicSse emits tool_use events', () => {
  const bytes = openAiCompletionToAnthropicSse(
    {
      id: 'chatcmpl-1',
      model: 'glm-5.2',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'Read', arguments: '{"file_path":"a.txt"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    },
    'glm-5.2'
  );
  const text = Buffer.from(bytes).toString('utf8');
  assert.match(text, /event: message_start/);
  assert.match(text, /"type":"tool_use"/);
  assert.match(text, /input_json_delta/);
  assert.match(text, /"stop_reason":"tool_use"/);
  assert.match(text, /event: message_stop/);
});

test('estimateTokensFromText returns positive for mixed text', () => {
  assert.equal(estimateTokensFromText(''), 0);
  assert.ok(estimateTokensFromText('hello 你好') > 0);
});

test('POST /v1/messages streams anthropic tool_use SSE', async () => {
  const fakeClient = {
    discoverCatPawAi: () => ({ openAiBaseUrlConfigured: true, authMode: 'catpaw', catpawTokenConfigured: true }),
    createChatCompletion: async () => ({
      id: 'chatcmpl-http',
      model: 'glm-5.2',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_http',
                type: 'function',
                function: { name: 'Bash', arguments: '{"command":"ls"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };

  const app = createApp({
    env: {
      CATPAWAI_OPENAI_BASE_URL: 'https://catpaw.meituan.com/api/gpt',
      CATPAWAI_AUTH_MODE: 'catpaw',
      CATPAWAI_ACCESS_TOKEN: 'token',
    },
    catpawaiClient: fakeClient,
  });
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'glm-5.2',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ls' }],
        tools: [{ name: 'Bash', input_schema: { type: 'object' } }],
      }),
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.match(text, /tool_use/);
    assert.match(text, /Bash/);
  } finally {
    server.close();
  }
});

test('POST /v1/messages/count_tokens returns estimate', async () => {
  const app = createApp({ env: {} });
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'glm-5.2',
        messages: [{ role: 'user', content: 'hello 世界' }],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.input_tokens > 0);
  } finally {
    server.close();
  }
});
