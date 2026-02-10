const http = require('http');
const { callProvider, loadConfig, resolveModel } = require('./client');

const PORT = 8888;

/**
 * Extract text from OpenAI message content (handles string, array, and object formats)
 * OpenClaw sends content as array: [{type: "text", text: "..."}]
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(p => p && p.type === 'text')
      .map(p => p.text || '')
      .join('\n');
  }
  if (content && typeof content === 'object') {
    if (content.text) return content.text;
    if (content.type === 'text') return content.text || '';
  }
  return '';
}

/**
 * Normalize messages array: preserve full message structure for tool calling.
 * - Convert array content to string (OpenClaw format)
 * - Preserve tool_calls, tool_call_id, name, function_call fields
 * - Keep messages with tool_calls even if content is empty
 */
function normalizeMessages(messages) {
  return messages.map(m => {
    const normalized = { role: m.role };

    // Extract content (may be string, array, or null for tool-call-only messages)
    const content = extractText(m.content);
    if (content) normalized.content = content;
    else if (m.content === null || m.content === undefined) normalized.content = null;
    else normalized.content = content || '';

    // Preserve tool_calls (assistant requesting tool use)
    if (m.tool_calls) normalized.tool_calls = m.tool_calls;

    // Preserve function_call (legacy format)
    if (m.function_call) normalized.function_call = m.function_call;

    // Preserve tool_call_id (tool result messages)
    if (m.tool_call_id) normalized.tool_call_id = m.tool_call_id;

    // Preserve name (function result messages)
    if (m.name) normalized.name = m.name;

    return normalized;
  }).filter(m => {
    // Keep messages that have content, tool_calls, or are tool results
    return m.content || m.tool_calls || m.function_call || m.tool_call_id || m.role === 'tool';
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── Health / Status endpoint ──────────────────────────
  if (req.url === '/v1/health' && req.method === 'GET') {
    try {
      const config = loadConfig();
      const providers = Object.keys(config.providers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: config.version,
        providers: providers,
        router: {
          default_provider: config.router?.default_provider,
          default_model: config.router?.default_model,
          fallback_chain: config.router?.fallback_chain
        }
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: e.message }));
    }
    return;
  }

  // ─── Models list endpoint (OpenAI compatible) ──────────
  if (req.url === '/v1/models' && req.method === 'GET') {
    try {
      const config = loadConfig();
      const aliases = config.router?.aliases || {};
      const models = Object.entries(aliases).map(([alias, target]) => ({
        id: alias,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: target.split('/')[0],
        _target: target
      }));
      // Also add direct provider/model combinations
      for (const [provName, provConfig] of Object.entries(config.providers)) {
        const provModels = provConfig.models || (provConfig.model ? [provConfig.model] : []);
        for (const m of provModels) {
          models.push({
            id: `${provName}/${m}`,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: provName
          });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: models }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
    return;
  }

  // ─── Chat Completions endpoint ─────────────────────────
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const isStream = data.stream === true;

        // Normalize messages
        const messages = normalizeMessages(data.messages || []);

        // The model from the request (could be alias, provider/model, or direct name)
        const requestedModel = data.model || null;

        // Extract tools/functions for forwarding to LLM
        const tools = data.tools || null;
        const functions = data.functions || null;
        const toolChoice = data.tool_choice || null;

        console.log(`[GhostGateway] Request: model="${requestedModel}" stream=${isStream} msgs=${messages.length} tools=${tools ? tools.length : 0}`);

        // Debug: log last user message (truncated)
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
          const txt = (lastUserMsg.content || '').substring(0, 120);
          console.log(`[GhostGateway] Last user msg: "${txt}"`);
        }

        // callProvider now handles all routing internally
        const result = await callProvider(requestedModel, messages, {
          temperature: data.temperature,
          maxTokens: data.max_tokens,
          system: messages.find(m => m.role === 'system')?.content,
          tools,
          functions,
          toolChoice
        });

        // Debug: log response details
        const respText = (result.text || '').substring(0, 150);
        const hasToolCalls = result.tool_calls && result.tool_calls.length > 0;
        console.log(`[GhostGateway] Response: model="${result.model}" text="${respText}" tool_calls=${hasToolCalls ? result.tool_calls.length : 0}`);
        if (hasToolCalls) {
          result.tool_calls.forEach((tc, i) => {
            const fn = tc.function || {};
            console.log(`[GhostGateway]   tool_call[${i}]: ${fn.name}(${(fn.arguments || '').substring(0, 80)})`);
          });
        }

        const completionId = `chatcmpl-${Date.now()}`;
        const created = Math.floor(Date.now() / 1000);
        const modelName = result.model;

        // Build the response message
        const responseMessage = { role: 'assistant' };
        if (result.text) responseMessage.content = result.text;
        else responseMessage.content = result.tool_calls ? null : '';

        // Include tool_calls if the LLM requested tool use
        if (result.tool_calls && result.tool_calls.length > 0) {
          responseMessage.tool_calls = result.tool_calls;
        }

        const finishReason = result.tool_calls ? 'tool_calls' : 'stop';

        if (isStream) {
          // SSE streaming response
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          const delta = { role: 'assistant' };
          if (result.text) delta.content = result.text;
          if (result.tool_calls) delta.tool_calls = result.tool_calls;

          const chunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelName,
            choices: [{
              index: 0,
              delta,
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);

          const finishChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelName,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: finishReason
            }],
            usage: {
              prompt_tokens: result.usage.prompt_tokens || 0,
              completion_tokens: result.usage.completion_tokens || 0,
              total_tokens: result.usage.total || 0
            }
          };
          res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();

        } else {
          // Standard JSON response
          const response = {
            id: completionId,
            object: 'chat.completion',
            created,
            model: modelName,
            choices: [{
              index: 0,
              message: responseMessage,
              finish_reason: finishReason
            }],
            usage: {
              prompt_tokens: result.usage.prompt_tokens || 0,
              completion_tokens: result.usage.completion_tokens || 0,
              total_tokens: result.usage.total || 0
            }
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        }

      } catch (error) {
        console.error('[GhostGateway] Error:', error.message || error);
        const status = error.status || 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: error.message || 'Internal Server Error',
            type: 'internal_error',
            code: status
          }
        }));
      }
    });
    return;
  }

  // ─── 404 ───────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Not Found', type: 'not_found' } }));
});

server.listen(PORT, () => {
  const config = loadConfig();
  console.log(`[GhostGateway v${config.version}] Listening on http://localhost:${PORT}`);
  console.log(`[GhostGateway] Providers: ${Object.keys(config.providers).join(', ')}`);
  console.log(`[GhostGateway] Default: ${config.router?.default_provider}/${config.router?.default_model}`);
  console.log(`[GhostGateway] Fallback: ${(config.router?.fallback_chain || []).join(' → ')}`);
  console.log(`[GhostGateway] Aliases: ${Object.keys(config.router?.aliases || {}).join(', ')}`);
});
