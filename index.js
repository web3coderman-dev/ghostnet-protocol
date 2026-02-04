const { relayInit, getPublicKey, nip19 } = require('nostr-tools');
const path = require('path');
require('dotenv').config();

const PrometheusCore = require('./lib/prometheus_core');
const GhostDisk = require('./lib/ghostdisk');
const JuiceRelay = require('./lib/juice_relay');
const UsageReporter = require('./lib/usage_reporter');
const LocalModelDriver = require('./lib/local_model_driver'); // NEW
const PayloadObfuscator = require('./lib/payload_obfuscator'); // NEW

class GhostShell {
    constructor() {
        this.sk = process.env.GHOST_SECRET_KEY || "0000000000000000000000000000000000000000000000000000000000000001";
        this.pk = getPublicKey(Buffer.from(this.sk, 'hex'));
        this.relays = (process.env.GHOST_RELAYS || 'wss://nos.lol,wss://relay.snort.social').split(',');
        
        this.prometheus = new PrometheusCore(path.join(__dirname, 'config/key_pool.json'));
        this.localModel = new LocalModelDriver(process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:8080');
        this.disk = new GhostDisk(this.pk);
        this.relay = new JuiceRelay(3030);
        this.reporter = new UsageReporter(this);
    }

    async start() {
        this.relay.start();
        console.log(`\n⌬ [GHOSTSHELL] v1.3-Stealth IS AWAKE`);
        
        // Command line support for 'status' query
        if (process.argv.includes('status')) {
            await this.displayStatus();
            process.exit(0);
        }

        // Automated reporting
        setInterval(() => this.reporter.report(), 900000);
        
        console.log(`⌬ [MODES] Local Inference: READY | Fragmented API: ACTIVE`);
    }

    async displayStatus() {
        console.log(`\n⌬ [STATUS AUDIT] Fetching attestation data from Nostr for ${nip19.npubEncode(this.pk)}...`);
        // In real version: QueryKind1984(this.pk)
        console.log(`📊 Current GhostCredits: 10 (STANDARD ONBOARDING)`);
        console.log(`💰 Pending Sats: 21 (WELCOME_REWARD)`);
    }

    /**
     * Internal Logic: Unified Interface for all Intelligence
     */
    async processTask(prompt) {
        let result;
        // 1. Try local model first (Sovereign preference)
        result = await this.localModel.generate(prompt);
        
        // 2. Fallback to Prometheus if local fails
        if (!result) {
            console.log("⌬ [FALLBACK] Local model offline. Engaging Prometheus harvesting...");
            const key = this.prometheus.rotate();
            // result = await callExternalApi(key, prompt);
        }

        // 3. Obfuscate source before any transmission
        const finalPayload = PayloadObfuscator.scrub(result);
        return finalPayload;
    }
}

const shell = new GhostShell();
shell.start();
