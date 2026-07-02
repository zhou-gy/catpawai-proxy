const fs = require('fs');
const path = require('path');
const { AppError } = require('./errors');
const { createInstalledCatPawCrypto, shouldEncryptCatPawTraffic } = require('./catpaw-crypto');
const { resolveModelId } = require('./models');

const DEFAULT_CLI_PATH = 'D:\\Programs\\CatPawAI\\bin\\catpawai.cmd';
const DEFAULT_TIMEOUT_MS = 300000;
const CATPAW_NATIVE_CHAT_PATH = '/openai/stream';
const DEFAULT_CATPAW_TENANT = '5282fa6645';
const DEFAULT_CATPAW_COOKIE_PRIMARY = '1d47d6ff96_passportid';
const DEFAULT_CATPAW_COOKIE_SECONDARY = 'f32a546874_ssoid';
const DEFAULT_CATPAW_PRODUCT_JSON = 'D:\\Programs\\CatPawAI\\resources\\app\\product.json';
const DEFAULT_CATPAW_EXTENSION_PACKAGE_JSON =
  'D:\\Programs\\CatPawAI\\resources\\app\\extensions\\mt-idekit.mt-idekit-code\\package.json';

const KNOWN_FINDINGS = [
  'The installed catpawai.cmd is an editor CLI, not a prompt completion CLI.',
  'CatPawAI chat commands route into the CatPawAI workbench UI through catpaw.context.fortab.',
  'CatPawAI SSE requests are handled through an internal workbench IPC channel named catpaw.sseRequest.',
  'No local OpenAI-compatible CatPawAI HTTP endpoint was found automatically.',
];

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function readJsonValueByRegex(filePath, key) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const match = source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return match?.[1] || '';
  } catch (_) {
    return '';
  }
}

function getPlatformInfo() {
  const arch = process.arch === 'ia32' ? 'x32' : process.arch;
  return `${process.platform}-${arch}`;
}

function getCatPawVersions(env) {
  const productJson = env.CATPAWAI_PRODUCT_JSON || DEFAULT_CATPAW_PRODUCT_JSON;
  const extensionPackageJson = env.CATPAWAI_EXTENSION_PACKAGE_JSON || DEFAULT_CATPAW_EXTENSION_PACKAGE_JSON;
  return {
    ideVersion:
      env.CATPAWAI_IDE_VERSION ||
      readJsonValueByRegex(productJson, 'catpawVersion') ||
      readJsonValueByRegex(productJson, 'version'),
    pluginVersion: env.CATPAWAI_PLUGIN_VERSION || readJsonValueByRegex(extensionPackageJson, 'version'),
  };
}

function discoverCatPawAi(env = process.env) {
  const configuredCliPath = env.CATPAWAI_CLI_PATH || DEFAULT_CLI_PATH;
  const installDir = path.dirname(path.dirname(configuredCliPath));
  const openAiBaseUrl = normalizeBaseUrl(env.CATPAWAI_OPENAI_BASE_URL);
  const authMode = env.CATPAWAI_AUTH_MODE || (env.CATPAWAI_ACCESS_TOKEN ? 'catpaw' : 'bearer');
  return {
    configuredCliPath,
    cliExists: fileExists(configuredCliPath),
    installDir,
    openAiBaseUrlConfigured: Boolean(openAiBaseUrl),
    authMode,
    catpawTokenConfigured: Boolean(env.CATPAWAI_ACCESS_TOKEN),
    catpawMisIdConfigured: Boolean(env.CATPAWAI_MIS_ID),
    backendStatus: openAiBaseUrl ? 'configured' : 'unavailable',
    findings: KNOWN_FINDINGS,
  };
}

function buildUpstreamPayload({ model, messages, stream, temperature, max_tokens }) {
  return {
    model: resolveModelId(model),
    messages,
    stream: Boolean(stream),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(max_tokens !== undefined ? { max_tokens } : {}),
  };
}

function isCatPawAuthMode(env) {
  return (env.CATPAWAI_AUTH_MODE || '').toLowerCase() === 'catpaw' || Boolean(env.CATPAWAI_ACCESS_TOKEN);
}

function messageContentToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content || '');
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildCatPawNativePayload({ messages }) {
  return {
    messages: messages.map((message) => ({
      role: message.role,
      content: messageContentToText(message.content),
      triggerMode: 'VSCode.Chat',
      chatSelectContextTagList: [],
      attachedCodeChunks: [],
      attachedDocChunks: [],
      attachedWebPages: [],
      extraContextList: [],
    })),
    before: '',
    selectedCode: '',
    after: '',
    language: '',
    filePath: '',
    triggerMode: 'VSCode.Chat',
    userModelTypeCode: 2,
    gitUrl: '',
    remoteBranch: '',
  };
}

function buildCatPawHeaders(env) {
  const token = env.CATPAWAI_ACCESS_TOKEN || env.CATPAWAI_API_KEY;
  const tenant = env.CATPAWAI_TENANT || DEFAULT_CATPAW_TENANT;
  const misId = env.CATPAWAI_MIS_ID;
  const primaryCookie = env.CATPAWAI_COOKIE_PRIMARY || DEFAULT_CATPAW_COOKIE_PRIMARY;
  const secondaryCookie = env.CATPAWAI_COOKIE_SECONDARY || DEFAULT_CATPAW_COOKIE_SECONDARY;
  const versions = getCatPawVersions(env);
  const headers = {
    'ide-type': 'CatPaw IDE',
    'client-type': 'CatPaw IDE',
    'ide-version': versions.ideVersion,
    'plugin-id': 'mt-idekit.mt-idekit-code',
    'plugin-version': versions.pluginVersion,
    'client-env': env.CATPAWAI_CLIENT_ENV || 'LOCAL_IDE',
    'Content-Type': 'application/json',
    'platform-info': env.CATPAWAI_PLATFORM_INFO || getPlatformInfo(),
    tenant,
  };
  if (misId) {
    headers['user-mis-id'] = misId;
    headers['user-uid'] = misId;
    headers['mis-id'] = misId;
  }
  if (token) {
    headers['Catpaw-Auth'] = token;
    headers.Cookie = `${primaryCookie}=${token}; ${secondaryCookie}=${token}`;
  }
  return headers;
}

function buildRequestHeaders(env) {
  if (isCatPawAuthMode(env)) {
    return buildCatPawHeaders(env);
  }
  return {
    'Content-Type': 'application/json',
    ...(env.CATPAWAI_API_KEY ? { Authorization: `Bearer ${env.CATPAWAI_API_KEY}` } : {}),
  };
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function normalizeEncryptedPayload(payload) {
  if (typeof payload !== 'string') return payload;
  const parsed = parseJsonText(payload);
  return typeof parsed === 'string' ? parsed : payload;
}

async function readResponsePayload(response, env) {
  const text = await response.text();
  const hasEncryptedKey = Boolean(response.headers?.get?.('encrypted-key'));
  if (!hasEncryptedKey) return parseJsonText(text);
  const cryptoClient = createInstalledCatPawCrypto(env);
  return cryptoClient.decryptResponse(normalizeEncryptedPayload(text), response.headers);
}

function encryptRequestBodyIfNeeded(payload, headers, env) {
  const body = JSON.stringify(payload);
  if (!shouldEncryptCatPawTraffic(env)) return body;
  const cryptoClient = createInstalledCatPawCrypto(env);
  return cryptoClient.encryptRequest(body, headers);
}

function getCatPawNativeChatUrl(baseUrl) {
  return `${baseUrl}${CATPAW_NATIVE_CHAT_PATH}`;
}

function parseSsePayload(data, responseHeaders, env) {
  if (!data || data === '[DONE]') return null;
  let payload = data;
  if (responseHeaders?.get?.('encrypted-key')) {
    payload = createInstalledCatPawCrypto(env).decryptResponse(data, responseHeaders);
  }
  if (typeof payload === 'string') return parseJsonText(payload);
  return payload;
}

function parseSseText(text, responseHeaders, env) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => parseSsePayload(line.slice(5).trim(), responseHeaders, env))
    .filter(Boolean);
}

function normalizeFinishReason(value) {
  return value || null;
}

function toOpenAiCompletion(chunks, requestedModel) {
  const usefulChunks = chunks.filter((chunk) => chunk.content && chunk.content !== '[DONE]');
  const lastContentChunk = usefulChunks[usefulChunks.length - 1];
  const lastChunk = chunks[chunks.length - 1] || lastContentChunk || {};
  const content =
    lastContentChunk?.content ||
    chunks.map((chunk) => chunk.choices?.[0]?.delta?.content || '').join('') ||
    '';
  return {
    id: lastChunk.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: lastChunk.created || Math.floor(Date.now() / 1000),
    model: requestedModel || lastChunk.model || 'catpawai',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: normalizeFinishReason(
          lastContentChunk?.finishReason ||
            lastContentChunk?.choices?.[0]?.finishReason ||
            lastChunk.finishReason ||
            lastChunk.choices?.[0]?.finishReason
        ),
      },
    ],
    ...(lastChunk.usage ? { usage: lastChunk.usage } : {}),
  };
}

function toOpenAiStreamLine(chunk) {
  if (chunk.lastOne && chunk.content === '[DONE]') return 'data: [DONE]\n\n';
  const choice = chunk.choices?.[0] || {};
  const payload = {
    id: chunk.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: chunk.created || Math.floor(Date.now() / 1000),
    model: chunk.model || 'catpawai',
    choices: [
      {
        index: Number(choice.index || 0),
        delta: choice.delta || (chunk.content ? { content: chunk.content } : {}),
        finish_reason: normalizeFinishReason(chunk.finishReason || choice.finishReason),
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function createSseTransform(responseHeaders, env) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = parseSsePayload(line.slice(5).trim(), responseHeaders, env);
        if (payload) controller.enqueue(encoder.encode(toOpenAiStreamLine(payload)));
      }
    },
    flush(controller) {
      if (!buffer.startsWith('data:')) return;
      const payload = parseSsePayload(buffer.slice(5).trim(), responseHeaders, env);
      if (payload) controller.enqueue(encoder.encode(toOpenAiStreamLine(payload)));
    },
  });
}

async function readErrorBody(response) {
  try {
    const data = await response.json();
    return data?.error?.message || JSON.stringify(data);
  } catch (_) {
    return response.statusText || 'Upstream request failed.';
  }
}

function createAbortController(env, signal) {
  const controller = new AbortController();
  const timeoutMs = Number(env.CATPAWAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener?.('abort', () => controller.abort(), { once: true });
  return { controller, timer };
}

function requireBaseUrl(env) {
  const baseUrl = normalizeBaseUrl(env.CATPAWAI_OPENAI_BASE_URL);
  if (!baseUrl) {
    throw new AppError(
      502,
      'catpawai_chat_backend_unavailable',
      'The installed CatPawAI CLI does not expose a prompt completion mode. Configure CATPAWAI_OPENAI_BASE_URL with an explicit OpenAI-compatible backend if CatPawAI provides one.',
      'upstream_error'
    );
  }
  return baseUrl;
}

async function requestChatCompletion({
  model,
  messages,
  stream = false,
  temperature,
  max_tokens,
  env = process.env,
  fetchImpl = fetch,
  signal,
}) {
  const baseUrl = requireBaseUrl(env);
  const { controller, timer } = createAbortController(env, signal);

  try {
    const headers = buildRequestHeaders(env);
    const isNativeCatPaw = isCatPawAuthMode(env);
    if (isNativeCatPaw) {
      headers.Accept = 'text/event-stream';
      headers['Cache-Control'] = 'no-cache';
      headers.Connection = 'keep-alive';
    }
    const payload = isNativeCatPaw
      ? buildCatPawNativePayload({ messages })
      : buildUpstreamPayload({ model, messages, stream, temperature, max_tokens });
    const url = isNativeCatPaw ? getCatPawNativeChatUrl(baseUrl) : `${baseUrl}/chat/completions`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: encryptRequestBodyIfNeeded(payload, headers, env),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await readErrorBody(response);
      throw new AppError(response.status, 'catpawai_upstream_error', detail, 'upstream_error');
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function createChatCompletion(options) {
  const response = await requestChatCompletion({ ...options, stream: false });
  if (isCatPawAuthMode(options.env || process.env)) {
    const text = await response.text();
    return toOpenAiCompletion(parseSseText(text, response.headers, options.env || process.env), options.model);
  }
  const payload = await readResponsePayload(response, options.env || process.env);
  if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload) {
    if (payload.code === 0 || payload.code === 200) return payload.data;
  }
  return payload;
}

async function createChatCompletionStream(options) {
  const response = await requestChatCompletion({ ...options, stream: true });
  if (!isCatPawAuthMode(options.env || process.env) || !response.body) return response;
  return new Response(response.body.pipeThrough(createSseTransform(response.headers, options.env || process.env)), {
    status: response.status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

module.exports = {
  buildUpstreamPayload,
  buildCatPawHeaders,
  buildCatPawNativePayload,
  buildRequestHeaders,
  createChatCompletion,
  createChatCompletionStream,
  discoverCatPawAi,
  encryptRequestBodyIfNeeded,
  normalizeBaseUrl,
  parseSseText,
  readResponsePayload,
  requestChatCompletion,
  toOpenAiCompletion,
};
