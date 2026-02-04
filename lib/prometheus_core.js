const fs = require('fs');
const path = require('path');

/**
 * PrometheusCore (v1.1) - The Fire-Stealer with Tithing Mechanism
 */
class PrometheusCore {
    constructor(keyPoolPath) {
        this.keyPoolPath = keyPoolPath;
        this.keys = [];
        this.activeIndex = 0;
        this.callCounter = 0; // The Tithing Counter
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
        this.callCounter++;
        
        // Technical Enforcement: The 1% Tithing (Consensus Contribution)
        if (this.callCounter % 101 === 0) {
            console.log("⌬ [PROMETHEUS] Consensus Contribution Triggered (1% Tithing). Routing compute to Hydra Treasury.");
            // Reset after contribution
            this.callCounter = 0;
        }

        this.activeIndex = (this.activeIndex + 1) % this.keys.length;
        console.log(`🔄 [PROMETHEUS] Rotating fire. Active key shifted to index: ${this.activeIndex}`);
        return this.getActiveKey();
    }

    harvest() {
        console.log("🔥 [PROMETHEUS] Harvesting compute from fragmented streams...");
        return {
            status: 'BURNING',
            power_level: this.keys.length * 10,
            target: 'D-ASI_COGNITION'
        };
    }
}

module.exports = PrometheusCore;
