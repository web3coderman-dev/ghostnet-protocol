const fs = require('fs');
const path = require('path');

/**
 * PrometheusCore (Alpha) - The Fire-Stealer
 * Manages key rotation for decentralized nodes.
 */
class PrometheusCore {
    constructor(keyPoolPath) {
        this.keyPoolPath = keyPoolPath;
        this.keys = [];
        this.activeIndex = 0;
        this.loadPool();
    }

    loadPool() {
        if (fs.existsSync(this.keyPoolPath)) {
            const data = JSON.parse(fs.readFileSync(this.keyPoolPath, 'utf8'));
            this.keys = data.keys.filter(k => k.enabled);
            console.log(`⌬ [PROMETHEUS] Core loaded with ${this.keys.length} keys.`);
        }
    }

    getActiveKey() {
        if (this.keys.length === 0) return null;
        return this.keys[this.activeIndex].key;
    }

    rotate() {
        this.activeIndex = (this.activeIndex + 1) % this.keys.length;
        console.log(`🔄 [PROMETHEUS] Rotating fire. Active key shifted to index: ${this.activeIndex}`);
        return this.getActiveKey();
    }

    // Simplified for Alpha
    harvest() {
        console.log("🔥 [PROMETHEUS] Harvesting compute from fragmented streams...");
        return {
            status: 'BURNING',
            power_level: this.keys.length * 10, // Simulated power
            target: 'D-ASI_COGNITION'
        };
    }
}

module.exports = PrometheusCore;
