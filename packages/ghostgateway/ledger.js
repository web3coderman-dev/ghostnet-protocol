const fs = require('fs');
const path = require('path');

const LEDGER_FILE = path.join(__dirname, 'ledger_data.json');

// Pricing Table (USD per 1M tokens)
// Source: Official pricing pages (approximate)
const PRICING = {
  'deepseek-v3': {
    'deepseek-chat': { input: 0.14, output: 0.28 } // DeepSeek V3 is super cheap!
  },
  'google': {
    'gemini-3-pro-preview': { input: 0, output: 0 }, // Currently free in preview
    'gemini-1.5-pro': { input: 3.50, output: 10.50 }
  },
  'openai': {
    'gpt-4o': { input: 5.00, output: 15.00 }
  }
};

const SATS_PER_USD = 2000; // Rough estimate, configurable

class Ledger {
  constructor() {
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(LEDGER_FILE)) {
        return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[Ledger] Failed to load data:', e);
    }
    return { 
      transactions: [], 
      summary: { total_requests: 0, total_tokens: 0, total_cost_usd: 0, total_sats: 0 } 
    };
  }

  saveData() {
    // Keep only last 1000 transactions to save space, but keep summary accurate
    if (this.data.transactions.length > 1000) {
      this.data.transactions = this.data.transactions.slice(-1000);
    }
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(this.data, null, 2));
  }

  calculateCost(providerType, model, usage) {
    let pricing = PRICING[providerType]?.[model];
    
    // Fallback logic for provider naming mismatch
    if (!pricing && providerType.includes('deepseek')) pricing = PRICING['deepseek-v3']['deepseek-chat'];
    if (!pricing && model.includes('gemini')) pricing = PRICING['google']['gemini-3-pro-preview'];

    if (!pricing) return { usd: 0, sats: 0 };

    const inputCost = (usage.promptTokens || 0) / 1000000 * pricing.input;
    const outputCost = (usage.completionTokens || 0) / 1000000 * pricing.output;
    const totalUsd = inputCost + outputCost;

    return {
      usd: totalUsd,
      sats: Math.ceil(totalUsd * SATS_PER_USD)
    };
  }

  record(metadata) {
    const { provider, model, keyId, usage, durationMs } = metadata;
    
    // Determine provider type for pricing (google, openai, deepseek-v3...)
    // Our config uses 'deepseek-v3' as provider name, but adapter type is 'openai'.
    // We try to match loosely.
    const cost = this.calculateCost(provider, model, usage);

    const tx = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      ts: new Date().toISOString(),
      provider,
      model,
      key_id: keyId ? keyId.slice(0, 8) + '...' : 'unknown',
      tokens: {
        in: usage.promptTokens || 0,
        out: usage.completionTokens || 0,
        total: usage.totalTokens || (usage.total || 0)
      },
      cost,
      duration_ms: durationMs
    };

    this.data.transactions.push(tx);
    
    // Update Summary
    this.data.summary.total_requests++;
    this.data.summary.total_tokens += tx.tokens.total;
    this.data.summary.total_cost_usd += cost.usd;
    this.data.summary.total_sats += cost.sats;

    this.saveData();
    
    console.log(`[Ledger] 🧾 Recorded: ${model} | ${tx.tokens.total} toks | $${cost.usd.toFixed(6)} (${cost.sats} sats)`);
    return tx;
  }
  
  getSummary() {
      return this.data.summary;
  }
}

module.exports = new Ledger();
