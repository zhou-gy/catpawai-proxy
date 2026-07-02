require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Readable } = require('node:stream');
const { AppError, openAiError } = require('./errors');
const defaultCatPawAiClient = require('./catpawai-client');
const { DEFAULT_MODEL_ID, MODELS } = require('./models');

function validateChatRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'invalid_request', 'Request body must be a JSON object.');
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new AppError(400, 'invalid_messages', 'messages must be a non-empty array.');
  }
  for (const message of body.messages) {
    if (!message || typeof message !== 'object') {
      throw new AppError(400, 'invalid_messages', 'Each message must be an object.');
    }
    if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
      throw new AppError(400, 'unsupported_role', `Unsupported message role: ${message.role}`);
    }
  }
}

function createApp({ env = process.env, catpawaiClient = defaultCatPawAiClient } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  function getDiagnostics() {
    const discovery = catpawaiClient.discoverCatPawAi(env);
    const needsCatPawToken = discovery.authMode === 'catpaw' && !discovery.catpawTokenConfigured;
    const ok = discovery.openAiBaseUrlConfigured && !needsCatPawToken;
    return {
      ok,
      name: 'catpawai-proxy',
      baseUrl: `http://127.0.0.1:${env.PORT || 13000}/v1`,
      catpawai: discovery,
      nextStep: needsCatPawToken
        ? 'Set CATPAWAI_ACCESS_TOKEN and CATPAWAI_MIS_ID, then retry /v1/chat/completions.'
        : discovery.openAiBaseUrlConfigured
          ? 'Use /v1/chat/completions.'
          : 'Set CATPAWAI_OPENAI_BASE_URL only if CatPawAI exposes an explicit OpenAI-compatible backend.',
    };
  }

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      name: 'catpawai-proxy',
      catpawai: catpawaiClient.discoverCatPawAi(env),
    });
  });

  app.get('/diagnostics', (_req, res) => {
    res.json(getDiagnostics());
  });

  app.get('/v1/models', (_req, res) => {
    res.json({
      object: 'list',
      data: MODELS.map((model) => ({
        id: model.id,
        object: 'model',
        created: 0,
        owned_by: model.owned_by,
      })),
    });
  });

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      validateChatRequest(req.body);
      const request = {
        model: req.body.model || DEFAULT_MODEL_ID,
        messages: req.body.messages,
        stream: Boolean(req.body.stream),
        temperature: req.body.temperature,
        max_tokens: req.body.max_tokens,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        parallel_tool_calls: req.body.parallel_tool_calls,
        env,
        signal: req.signal,
      };
      if (request.stream && catpawaiClient.createChatCompletionStream) {
        const upstream = await catpawaiClient.createChatCompletionStream(request);
        res.status(200);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (!upstream.body) {
          res.end();
          return;
        }
        Readable.fromWeb(upstream.body).pipe(res);
        return;
      }
      const result = await catpawaiClient.createChatCompletion({
        ...request,
        stream: false,
      });
      res.status(200).json(result);
    } catch (error) {
      const { status, body } = openAiError(error);
      res.status(status).json(body);
    }
  });

  app.use((error, _req, res, _next) => {
    const { status, body } = openAiError(error);
    res.status(status).json(body);
  });

  return app;
}

module.exports = {
  createApp,
  validateChatRequest,
};
