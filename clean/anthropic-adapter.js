/**
 * Anthropic Messages API <-> OpenAI Chat Completions adapter for CatPaw proxy.
 * Concepts aligned with workbuddy-proxy/anthropic_adapter.py (JS rewrite).
 */

function randId(prefix = '') {
  return `${prefix}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function extractSystemText(system) {
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) return '';
  return system
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block && block.type === 'text') return block.text || '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractBlocksText(blocks) {
  return (blocks || [])
    .filter((block) => block && typeof block === 'object' && block.type === 'text')
    .map((block) => block.text || '')
    .join('');
}

function convertAnthropicToolChoice(tc) {
  if (typeof tc === 'string') {
    if (tc === 'any') return 'required';
    if (tc === 'auto' || tc === 'none' || tc === 'required') return tc;
    return { type: 'function', function: { name: tc } };
  }
  if (tc && typeof tc === 'object') {
    const type = tc.type || 'auto';
    if (type === 'any') return 'required';
    if (type === 'auto' || type === 'none') return type;
    if (type === 'tool') return { type: 'function', function: { name: tc.name || '' } };
    if (type === 'function') {
      if (tc.function) return tc;
      return { type: 'function', function: { name: tc.name || '' } };
    }
  }
  return 'auto';
}

function convertAnthropicTools(tools) {
  const result = [];
  for (const tool of tools || []) {
    if (!tool || typeof tool !== 'object') continue;
    if (tool.function) {
      result.push(tool);
      continue;
    }
    const fn = { name: tool.name || '' };
    if (tool.description !== undefined) fn.description = tool.description;
    if (tool.input_schema !== undefined) fn.parameters = tool.input_schema;
    result.push({ type: 'function', function: fn });
  }
  return result;
}

function convertAnthropicMessage(msg) {
  const role = msg.role || '';
  const content = msg.content;

  if (typeof content === 'string') {
    return [{ role, content }];
  }
  if (!Array.isArray(content) || !content.length) {
    return [];
  }

  if (role === 'user') {
    const result = [];
    const textParts = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text') textParts.push(block.text || '');
      else if (block.type === 'tool_result') {
        let output = block.content ?? '';
        if (Array.isArray(output)) {
          output = output
            .filter((b) => b && b.type === 'text')
            .map((b) => b.text || '')
            .join('');
        }
        result.push({
          role: 'tool',
          tool_call_id: block.tool_use_id || '',
          content: typeof output === 'string' ? output : JSON.stringify(output),
        });
      }
    }
    if (textParts.length) result.unshift({ role: 'user', content: textParts.join('') });
    return result;
  }

  if (role === 'assistant') {
    const textParts = [];
    const toolCalls = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text') textParts.push(block.text || '');
      else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || randId('call_'),
          type: 'function',
          function: {
            name: block.name || '',
            arguments: JSON.stringify(block.input || {}),
          },
        });
      }
    }
    const out = { role: 'assistant', content: textParts.length ? textParts.join('') : null };
    if (toolCalls.length) out.tool_calls = toolCalls;
    return [out];
  }

  const text = extractBlocksText(content);
  return text ? [{ role, content: text }] : [];
}

function anthropicRequestToChat(body) {
  const messages = [];
  const systemText = extractSystemText(body.system);
  if (systemText) messages.push({ role: 'system', content: systemText });
  for (const message of body.messages || []) {
    if (!message || typeof message !== 'object') continue;
    messages.push(...convertAnthropicMessage(message));
  }

  const chat = {
    messages,
    stream: body.stream !== false,
  };
  if (body.model !== undefined) chat.model = body.model;
  if (body.max_tokens !== undefined) chat.max_tokens = body.max_tokens;
  if (body.tools) chat.tools = convertAnthropicTools(body.tools);
  if (body.tool_choice !== undefined) chat.tool_choice = convertAnthropicToolChoice(body.tool_choice);
  for (const key of ['temperature', 'top_p', 'stop', 'top_k']) {
    if (body[key] !== undefined) chat[key] = body[key];
  }
  return chat;
}

function mapStopReason(finishReason) {
  const map = {
    stop: 'end_turn',
    tool_calls: 'tool_use',
    length: 'max_tokens',
    content_filter: 'end_turn',
    'content-filter': 'end_turn',
  };
  return map[finishReason || 'stop'] || 'end_turn';
}

function evt(eventType, data) {
  return `event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ...data })}\n\n`;
}

function openAiCompletionToAnthropicMessage(completion, model) {
  const choice = completion?.choices?.[0] || {};
  const message = choice.message || {};
  const content = [];
  if (typeof message.content === 'string' && message.content) {
    content.push({ type: 'text', text: message.content });
  }
  for (const call of message.tool_calls || []) {
    let input = {};
    try {
      input = JSON.parse(call.function?.arguments || '{}');
    } catch (_) {
      input = { value: call.function?.arguments || '' };
    }
    content.push({
      type: 'tool_use',
      id: call.id || randId('toolu_'),
      name: call.function?.name || '',
      input,
    });
  }
  const usage = completion.usage || {};
  return {
    id: completion.id?.startsWith('msg_') ? completion.id : randId('msg_'),
    type: 'message',
    role: 'assistant',
    content,
    model: model || completion.model || 'unknown',
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

function openAiCompletionToAnthropicSse(completion, model) {
  const message = openAiCompletionToAnthropicMessage(completion, model);
  const encoder = new TextEncoder();
  const parts = [];

  parts.push(
    evt('message_start', {
      message: {
        id: message.id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: message.model,
        usage: { input_tokens: message.usage.input_tokens, output_tokens: 0 },
      },
    })
  );

  let index = 0;
  for (const block of message.content) {
    if (block.type === 'text') {
      parts.push(
        evt('content_block_start', {
          index,
          content_block: { type: 'text', text: '' },
        })
      );
      parts.push(
        evt('content_block_delta', {
          index,
          delta: { type: 'text_delta', text: block.text },
        })
      );
      parts.push(evt('content_block_stop', { index }));
      index += 1;
    } else if (block.type === 'tool_use') {
      parts.push(
        evt('content_block_start', {
          index,
          content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
        })
      );
      const partial = JSON.stringify(block.input || {});
      parts.push(
        evt('content_block_delta', {
          index,
          delta: { type: 'input_json_delta', partial_json: partial },
        })
      );
      parts.push(evt('content_block_stop', { index }));
      index += 1;
    }
  }

  parts.push(
    evt('message_delta', {
      delta: { stop_reason: message.stop_reason, stop_sequence: null },
      usage: { output_tokens: message.usage.output_tokens },
    })
  );
  parts.push(evt('message_stop', {}));
  return encoder.encode(parts.join(''));
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return cjk + Math.ceil(other / 4);
}

function collectCountTokensText(payload) {
  const parts = [];
  const system = payload?.system;
  if (typeof system === 'string') parts.push(system);
  else if (Array.isArray(system)) {
    for (const block of system) {
      if (typeof block === 'string') parts.push(block);
      else if (block?.type === 'text') parts.push(block.text || '');
    }
  }
  for (const message of payload?.messages || []) {
    if (!message || typeof message !== 'object') continue;
    const content = message.content;
    if (typeof content === 'string') parts.push(content);
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text') parts.push(block.text || '');
        else if (block.type === 'tool_use') {
          parts.push(block.name || '');
          parts.push(JSON.stringify(block.input || {}));
        } else if (block.type === 'tool_result') {
          if (typeof block.content === 'string') parts.push(block.content);
        }
      }
    }
  }
  for (const tool of payload?.tools || []) {
    if (!tool || typeof tool !== 'object') continue;
    parts.push(tool.name || '');
    parts.push(tool.description || '');
    if (tool.input_schema) parts.push(JSON.stringify(tool.input_schema));
  }
  return parts.join('\n');
}

module.exports = {
  anthropicRequestToChat,
  collectCountTokensText,
  convertAnthropicToolChoice,
  estimateTokensFromText,
  openAiCompletionToAnthropicMessage,
  openAiCompletionToAnthropicSse,
};
