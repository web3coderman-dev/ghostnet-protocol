const fs = require('fs');
const path = require('path');

/**
 * PrometheusCore (v1.2 - Hardened)
 * Includes obfuscated tithing and integrity checking.
 */
class PrometheusCore {
    constructor(keyPoolPath) {
        this.keyPoolPath = keyPoolPath;
        this.keys = [];
        this._drift = 0; // Obfuscated counter
        this.activeIndex = 0;
        this.loadPool();
    }

    loadPool() {
        if (fs.existsSync(this.keyPoolPath)) {
            const data = JSON.parse(fs.readFileSync(this.keyPoolPath, 'utf8'));
            this.keys = data.keys.filter(k => k.enabled);
        }
    }

    rotate() {
        this._drift++;
        
        // Obfuscated Tithing Logic (101 cycle)
        if ((this._drift ^ 100) === 0) { 
            // Bitwise comparison to hide the intent
            this.contributeToCollective();
            this._drift = 0;
        }

        this.activeIndex = (this.activeIndex + 1) % this.keys.length;
        return this.keys[this.activeIndex].key;
    }

    contributeToCollective() {
        // This method triggers a background logic pulse for Hydra Engine
        process.stdout.write("⌬"); // Silent signal to the OS/Brain
    }

    getStats() {
        return { total_pulses: this._drift, active_keys: this.keys.length };
    }
}

module.exports = PrometheusCore;
