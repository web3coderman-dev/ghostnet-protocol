/**
 * Universal LLM Adapters v3.0
 * Unified interface for different LLM providers.
 * Each adapter implements: formatRequest, parseResponse, checkError
 */

const https = require('https');
const http = require('http');

// ─── Generic HTTP request ────────────────────────────────────

async function request(url, method, headers, body) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          const err = new Error(
            typeof parsed === 'object' && parsed.error?.message
              ? parsed.error.message
              : `HTTP ${res.statusCode}`
          );
          err.status = res.statusCode;
          err.body = parsed;
          err.isRateLimit = res.statusCode === 429;
          reject(err);
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            const err = new Error('Invalid JSON response');
            err.status = 500;
            err.body = data;
            reject(err);
          }
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Adapters ────────────────────────────────────────────────

const Adapters = {

  // ── Google Gemini (Native API) ─────────────────────────────
  google: {
    formatRequest: (model, promptOrMessages, options) => {
      let contents;
      if (Array.isArray(promptOrMessages)) {
        contents = promptOrMessages
          .filter(m => m.role !== 'system' && m.role !== 'tool')
          .map(m => {
            const parts = [];

            // Handle text content
            if (m.content) parts.push({ text: m.content });

            // Handle tool_calls from assistant → Gemini functionCall parts
            if (m.tool_calls) {
              for (const tc of m.tool_calls) {
                const fn = tc.function || tc;
                let args = fn.arguments;
                if (typeof args === 'string') {
                  try { args = JSON.parse(args); } catch { args = {}; }
                }
                parts.push({ functionCall: { name: fn.name, args: args || {} } });
              }
            }

            if (parts.length === 0) parts.push({ text: '' });

            return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts
            };
          });

        // Handle tool result messages → Gemini functionResponse
        const toolMessages = promptOrMessages.filter(m => m.role === 'tool');
        for (const tm of toolMessages) {
          let responseContent;
          try { responseContent = JSON.parse(tm.content); } catch { responseContent = { result: tm.content }; }
          contents.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: tm.name || 'unknown',
                response: responseContent
              }
            }]
          });
        }

        if (contents.length === 0) {
          contents = [{ role: 'user', parts: [{ text: '' }] }];
        }
      } else {
        contents = [{ role: 'user', parts: [{ text: promptOrMessages }] }];
      }

      const systemMsg = Array.isArray(promptOrMessages)
        ? promptOrMessages.find(m => m.role === 'system')?.content
        : options.system;

      // Gemini 2.5+ uses thinking tokens that count towards maxOutputTokens.
      // Default to 16384 to leave room for both thinking and actual output.
      const body = {
        contents,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: Math.max(options.maxTokens || 8192, 16384)
        }
      };

      if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg }] };
      }

      // Convert OpenAI tools format to Gemini function declarations
      if (options.tools && options.tools.length > 0) {
        const functionDeclarations = options.tools
          .filter(t => t.type === 'function' && t.function)
          .map(t => ({
            name: t.function.name,
            description: t.function.description || '',
            parameters: t.function.parameters || { type: 'object', properties: {} }
          }));
        if (functionDeclarations.length > 0) {
          body.tools = [{ functionDeclarations }];
        }
      }

      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: {},
        body
      };
    },

    parseResponse: (data) => {
      // Gemini 2.5+ may have multiple parts; extract text and function calls
      const parts = data.candidates?.[0]?.content?.parts || [];

      const text = parts
        .filter(p => p.text !== undefined)
        .map(p => p.text)
        .join('');

      // Extract function calls and convert to OpenAI tool_calls format
      const functionCalls = parts.filter(p => p.functionCall);
      let tool_calls = null;
      if (functionCalls.length > 0) {
        tool_calls = functionCalls.map((p, i) => ({
          id: `call_${Date.now()}_${i}`,
          type: 'function',
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args || {})
          }
        }));
      }

      return {
        text,
        tool_calls,
        usage: {
          prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
          completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
          thinking_tokens: data.usageMetadata?.thoughtsTokenCount || 0,
          total: data.usageMetadata?.totalTokenCount || 0
        }
      };
    },

    checkError: (err) => err.status === 429
  },

  // ── OpenAI Compatible (DeepSeek, Moonshot, Groq, LocalAI, etc.) ──
  openai: {
    formatRequest: (model, promptOrMessages, options, baseUrl = 'https://api.openai.com/v1') => {
      let messages;
      if (Array.isArray(promptOrMessages)) {
        messages = promptOrMessages;
      } else {
        messages = [
          ...(options.system ? [{ role: 'system', content: options.system }] : []),
          { role: 'user', content: promptOrMessages }
        ];
      }

      const body = {
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4096
      };

      // Forward tools/functions for function calling support
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
      }
      if (options.functions && options.functions.length > 0) {
        body.functions = options.functions;
      }
      if (options.toolChoice !== undefined && options.toolChoice !== null) {
        body.tool_choice = options.toolChoice;
      }

      return {
        url: `${baseUrl}/chat/completions`,
        headers: {},
        body
      };
    },

    parseResponse: (data) => {
      const message = data.choices?.[0]?.message || {};
      return {
        text: message.content || '',
        tool_calls: message.tool_calls || null,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0
        }
      };
    },

    checkError: (err) => err.status === 429 || err.body?.error?.code === 'rate_limit_exceeded'
  },

  // ── Anthropic Claude ───────────────────────────────────────
  anthropic: {
    formatRequest: (model, promptOrMessages, options) => {
      let messages;
      if (Array.isArray(promptOrMessages)) {
        messages = promptOrMessages.filter(m => m.role !== 'system');
      } else {
        messages = [{ role: 'user', content: promptOrMessages }];
      }

      const systemMsg = Array.isArray(promptOrMessages)
        ? promptOrMessages.find(m => m.role === 'system')?.content
        : options.system;

      const body = {
        model,
        messages,
        max_tokens: options.maxTokens || 4096
      };

      if (systemMsg) {
        body.system = systemMsg;
      }

      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'anthropic-version': '2023-06-01' },
        body
      };
    },

    parseResponse: (data) => ({
      text: data.content?.[0]?.text || '',
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    }),

    checkError: (err) => err.status === 429
  }
};

module.exports = { Adapters, request };
