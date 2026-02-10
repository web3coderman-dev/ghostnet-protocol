const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'key_state.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

class SmartKeyManager {
  constructor() {
    this.state = this._loadState();
    this._roundRobinIndex = {}; // { "provider:tier": nextIndex }
  }

  // ─── Config ──────────────────────────────────────────────

  _loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }

  _loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[SmartManager] Failed to load state:', e.message);
    }
    return { keys: {} };
  }

  _saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('[SmartManager] Failed to save state:', e.message);
    }
  }

  // ─── Key Selection (tier-aware round-robin) ──────────────

  /**
   * Get an available key for a provider.
   * Strategy:
   *   1. Filter by preferred tier first (e.g. "free")
   *   2. If no free keys available, fall back to all tiers
   *   3. Within a tier, use round-robin selection
   *
   * @param {string} providerName
   * @param {string} [preferTier] - "free" or "paid", optional
   * @returns {{ key: string, tier: string, label: string } | null}
   */
  getAvailableKey(providerName, preferTier) {
    const config = this._loadConfig();
    const provider = config.providers[providerName];
    if (!provider) return null;

    // Normalize keys: support both v2 (string[]) and v3 (object[]) formats
    const allKeys = this._normalizeKeys(provider.keys);
    const now = Date.now();

    // Filter keys that are not in cooldown
    const healthyKeys = allKeys.filter(k => {
      const s = this.state.keys[k.key];
      if (!s) return true;
      if (s.cooldownUntil && s.cooldownUntil > now) return false;
      return true;
    });

    if (healthyKeys.length === 0) return null;

    // Try preferred tier first
    if (preferTier) {
      const tierKeys = healthyKeys.filter(k => k.tier === preferTier);
      if (tierKeys.length > 0) {
        return this._roundRobinPick(providerName, preferTier, tierKeys);
      }
    }

    // Fall back to any available key
    return this._roundRobinPick(providerName, 'all', healthyKeys);
  }

  /**
   * Normalize keys from config: supports string[] (v2) and object[] (v3)
   */
  _normalizeKeys(keys) {
    if (!Array.isArray(keys)) return [];
    return keys.map((k, i) => {
      if (typeof k === 'string') {
        return { key: k, tier: 'free', label: `key-${i}` };
      }
      return {
        key: k.key,
        tier: k.tier || 'free',
        label: k.label || `key-${i}`
      };
    });
  }

  /**
   * Round-robin selection within a key group
   */
  _roundRobinPick(providerName, tierGroup, keys) {
    const rrKey = `${providerName}:${tierGroup}`;
    const idx = this._roundRobinIndex[rrKey] || 0;
    const picked = keys[idx % keys.length];
    this._roundRobinIndex[rrKey] = (idx + 1) % keys.length;
    return picked;
  }

  // ─── Error / Success Reporting ───────────────────────────

  /**
   * Report an error for a key. Applies cooldown based on error type.
   * @param {string|object} keyOrObj - key string or { key, tier, label }
   * @param {string} providerName
   * @param {Error|object} error
   */
  reportError(keyOrObj, providerName, error) {
    const keyStr = typeof keyOrObj === 'string' ? keyOrObj : keyOrObj.key;
    if (!this.state.keys[keyStr]) {
      this.state.keys[keyStr] = { errors: 0, cooldownUntil: 0 };
    }

    const keyState = this.state.keys[keyStr];
    keyState.errors = (keyState.errors || 0) + 1;
    keyState.lastErrorAt = Date.now();

    const status = error.status || error.statusCode;
    const isRateLimit = status === 429 || error.isRateLimit;
    const isAuthError = status === 401 || status === 403;

    if (isRateLimit) {
      // 429: Cooldown 5 minutes
      const cooldown = 5 * 60 * 1000;
      console.warn(`[SmartManager] Rate limit → ${providerName} key ${keyStr.slice(0, 12)}… (cooldown ${cooldown / 1000}s)`);
      keyState.cooldownUntil = Date.now() + cooldown;
      keyState.lastError = 'rate_limit';
    } else if (isAuthError) {
      // 401/403: Cooldown 24 hours
      console.warn(`[SmartManager] Auth error → ${providerName} key ${keyStr.slice(0, 12)}… (cooldown 24h)`);
      keyState.cooldownUntil = Date.now() + 24 * 60 * 60 * 1000;
      keyState.lastError = 'auth_error';
    } else {
      // Other: brief 30s pause
      keyState.cooldownUntil = Date.now() + 30 * 1000;
      keyState.lastError = (error.message || 'unknown').slice(0, 200);
    }

    this._saveState();
  }

  /**
   * Report a successful call. Clears transient errors.
   * @param {string|object} keyOrObj
   */
  reportSuccess(keyOrObj) {
    const keyStr = typeof keyOrObj === 'string' ? keyOrObj : keyOrObj.key;
    if (this.state.keys[keyStr]) {
      const s = this.state.keys[keyStr];
      // Clear cooldown for non-rate-limit errors
      if (s.lastError !== 'rate_limit') {
        s.cooldownUntil = 0;
      }
      this._saveState();
    }
  }

  // ─── Diagnostics ─────────────────────────────────────────

  /**
   * Get a summary of key health for a provider
   */
  getProviderHealth(providerName) {
    const config = this._loadConfig();
    const provider = config.providers[providerName];
    if (!provider) return null;

    const allKeys = this._normalizeKeys(provider.keys);
    const now = Date.now();

    return allKeys.map(k => {
      const s = this.state.keys[k.key];
      const inCooldown = s && s.cooldownUntil && s.cooldownUntil > now;
      return {
        label: k.label,
        tier: k.tier,
        status: inCooldown ? 'cooldown' : 'ready',
        lastError: s?.lastError || null,
        cooldownRemaining: inCooldown ? Math.ceil((s.cooldownUntil - now) / 1000) + 's' : null
      };
    });
  }
}

module.exports = new SmartKeyManager();
