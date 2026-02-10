const fs = require('fs');
const path = require('path');
const { Adapters, request } = require('./adapters');
const smartManager = require('./smart_manager');
const ledger = require('./ledger');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ─── Alias Resolution ────────────────────────────────────────

/**
 * Resolve a model name to { providerName, modelId } using:
 *   1. router.aliases  (e.g. "deepseek-v3" → "deepseek/deepseek-chat")
 *   2. "provider/model" syntax  (e.g. "deepseek/deepseek-chat")
 *   3. Direct provider name match  (e.g. "google-free" → default_model)
 *   4. Scan all providers for a matching model name
 *   5. Fall back to router defaults
 */
function resolveModel(config, requestedModel) {
  const router = config.router || {};
  const aliases = router.aliases || {};

  // 1. Check aliases
  if (requestedModel && aliases[requestedModel]) {
    const alias = aliases[requestedModel];
    if (alias.includes('/')) {
      const [prov, model] = alias.split('/', 2);
      return { providerName: prov, modelId: model };
    }
    // Alias points to a provider name
    const prov = config.providers[alias];
    return { providerName: alias, modelId: prov?.default_model || prov?.model || null };
  }

  // 2. "provider/model" syntax
  if (requestedModel && requestedModel.includes('/')) {
    const [prov, model] = requestedModel.split('/', 2);
    if (config.providers[prov]) {
      return { providerName: prov, modelId: model };
    }
  }

  // 3. Direct provider name match
  if (requestedModel && config.providers[requestedModel]) {
    const prov = config.providers[requestedModel];
    return { providerName: requestedModel, modelId: prov.default_model || prov.model || null };
  }

  // 4. Scan all providers for a matching model name
  if (requestedModel) {
    for (const [provName, provConfig] of Object.entries(config.providers)) {
      const models = provConfig.models || (provConfig.model ? [provConfig.model] : []);
      if (models.includes(requestedModel)) {
        return { providerName: provName, modelId: requestedModel };
      }
    }
  }

  // 5. Fall back to router defaults
  return {
    providerName: router.default_provider || router.default || Object.keys(config.providers)[0],
    modelId: router.default_model || null
  };
}

// ─── Timeout wrapper ─────────────────────────────────────────

function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms: ${label}`));
    }, ms);
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// ─── Main Call Function ──────────────────────────────────────

/**
 * Call an LLM provider with full routing logic:
 *   1. Resolve model alias → (provider, model)
 *   2. Try keys for that provider+model (tier-aware round-robin)
 *   3. Model cascade within provider (e.g. Pro → Flash)
 *   4. Provider fallback chain
 *
 * @param {string} requestedModel - model name from the incoming request
 * @param {Array|string} messagesOrPrompt - messages array or prompt string
 * @param {object} options - { temperature, maxTokens, system, tools, functions, toolChoice }
 * @returns {Promise<{ provider, model, text, tool_calls, usage }>}
 */
async function callProvider(requestedModel, messagesOrPrompt, options = {}) {
  const startTime = Date.now();
  const config = loadConfig();
  const router = config.router || {};
  const timeoutMs = router.timeout_ms || 30000;
  const preferTier = router.prefer_tier || null;
  const maxRetries = 3;

  // Support both messages array and string prompt
  const messages = Array.isArray(messagesOrPrompt) ? messagesOrPrompt : null;
  const prompt = messages ? null : messagesOrPrompt;

  // Resolve the requested model
  const resolved = resolveModel(config, requestedModel);
  console.log(`[GhostGateway] Resolved "${requestedModel}" → provider="${resolved.providerName}" model="${resolved.modelId}"`);

  // Build the provider attempt order
  const fallbackChain = router.fallback_chain || [resolved.providerName];

  // Ensure the resolved provider is first
  const providerOrder = [resolved.providerName, ...fallbackChain.filter(p => p !== resolved.providerName)];
  // Deduplicate
  const seen = new Set();
  const uniqueProviders = providerOrder.filter(p => { if (seen.has(p)) return false; seen.add(p); return true; });

  let lastError = null;

  for (const providerName of uniqueProviders) {
    const providerConfig = config.providers[providerName];
    if (!providerConfig) {
      console.warn(`[GhostGateway] Provider "${providerName}" not found, skipping.`);
      continue;
    }

    // Build model cascade for this provider
    const modelCascade = buildModelCascade(config, providerName, resolved.modelId, providerName === resolved.providerName);

    for (const modelId of modelCascade) {
      // Key retry loop
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const keyObj = smartManager.getAvailableKey(providerName, preferTier);
        if (!keyObj) {
          console.warn(`[GhostGateway] No keys for "${providerName}", moving to next model/provider.`);
          break;
        }

        console.log(`[GhostGateway] Trying ${providerName}/${modelId} [${keyObj.label}|${keyObj.tier}] attempt=${attempt + 1}`);

        try {
          const result = await withTimeout(
            executeRequest(providerConfig, keyObj.key, modelId, messages || prompt, options),
            timeoutMs,
            `${providerName}/${modelId}`
          );

          smartManager.reportSuccess(keyObj);

          // Record to ledger
          ledger.record({
            provider: providerName,
            model: modelId,
            keyId: keyObj.label,
            usage: {
              promptTokens: result.usage.prompt_tokens || 0,
              completionTokens: result.usage.completion_tokens || 0,
              totalTokens: result.usage.total || result.usage.total_tokens || 0
            },
            durationMs: Date.now() - startTime
          });

          return {
            provider: providerName,
            model: modelId,
            text: result.text,
            tool_calls: result.tool_calls || null,
            usage: result.usage
          };

        } catch (error) {
          console.error(`[GhostGateway] Error ${providerName}/${modelId} [${keyObj.label}]:`, error.message || error);
          smartManager.reportError(keyObj, providerName, error);
          lastError = error;
        }
      }
    }
  }

  throw lastError || new Error('All providers, models, and keys exhausted.');
}

// ─── Model Cascade Builder ───────────────────────────────────

/**
 * Build the ordered list of models to try for a provider.
 * If this is the originally resolved provider, start from the resolved model.
 * Otherwise, use the provider's cascade or default_model.
 */
function buildModelCascade(config, providerName, resolvedModelId, isOriginalProvider) {
  const router = config.router || {};
  const providerConfig = config.providers[providerName];
  const cascade = (router.model_cascade && router.model_cascade[providerName]) || null;
  const allModels = providerConfig.models || (providerConfig.model ? [providerConfig.model] : []);
  const defaultModel = providerConfig.default_model || providerConfig.model || allModels[0];

  if (isOriginalProvider && resolvedModelId) {
    // Start from the requested model, then cascade through others
    if (cascade) {
      const startIdx = cascade.indexOf(resolvedModelId);
      if (startIdx >= 0) {
        return cascade.slice(startIdx);
      }
      // Requested model not in cascade, put it first then cascade
      return [resolvedModelId, ...cascade.filter(m => m !== resolvedModelId)];
    }
    // No cascade defined, just try the requested model then all others
    return [resolvedModelId, ...allModels.filter(m => m !== resolvedModelId)];
  }

  // Fallback provider: use cascade or all models starting from default
  if (cascade) return cascade;
  if (defaultModel) {
    return [defaultModel, ...allModels.filter(m => m !== defaultModel)];
  }
  return allModels;
}

// ─── Request Execution ───────────────────────────────────────

/**
 * Execute a single request against a provider+model+key.
 * The model is now passed dynamically (not from providerConfig.model).
 */
async function executeRequest(providerConfig, apiKey, modelId, promptOrMessages, options) {
  const adapterType = providerConfig.type || 'openai'; // Default to openai
  const adapter = Adapters[adapterType];
  if (!adapter) {
    throw new Error(`Adapter type "${adapterType}" not found. Available: ${Object.keys(Adapters).join(', ')}`);
  }

  const requestData = adapter.formatRequest(
    modelId,              // Dynamic model ID (not providerConfig.model)
    promptOrMessages,
    options,
    providerConfig.baseUrl
  );

  let url = requestData.url;
  const headers = {
    'Content-Type': 'application/json',
    ...requestData.headers
  };

  // Auth injection by adapter type
  if (adapterType === 'google') {
    url += (url.includes('?') ? '&' : '?') + `key=${apiKey}`;
  } else if (adapterType === 'anthropic') {
    headers['x-api-key'] = apiKey;
  } else {
    // openai and any unknown type: use Bearer token
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const responseData = await request(url, 'POST', headers, requestData.body);
  return adapter.parseResponse(responseData);
}

module.exports = { callProvider, loadConfig, resolveModel };
