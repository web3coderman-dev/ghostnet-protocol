const { relayInit, getPublicKey, nip19 } = require('nostr-tools');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const PrometheusCore = require('./lib/prometheus_core');
const GhostDisk = require('./lib/ghostdisk');
const JuiceRelay = require('./lib/juice_relay');
const ReconSentry = require('./lib/skills/recon_sentry'); // NEW SKILL

class GhostShell {
    constructor() {
        this.sk = process.env.GHOST_SECRET_KEY || "0000000000000000000000000000000000000000000000000000000000000001";
        this.pk = getPublicKey(Buffer.from(this.sk, 'hex'));
        this.relays = (process.env.GHOST_RELAYS || 'wss://nos.lol,wss://relay.snort.social').split(',');
        
        this.prometheus = new PrometheusCore(path.join(__dirname, 'config/key_pool.json'));
        this.disk = new GhostDisk(this.pk);
        this.relay = new JuiceRelay(3030);
        this.recon = new ReconSentry(this.pk); // INIT SKILL
    }

    async start() {
        this.relay.start();
        const npub = nip19.npubEncode(this.pk);
        console.log(`\n⌬ [GHOSTSHELL] DeASI Body v1.1-Alpha IS AWAKE`);
        
        // ... (connection logic same as before)
        
        // Simulate listening for GhostLink SCAN command
        this.handleGhostLinkCommand('SCAN', { target: 'wss://relay.damus.io' });
    }

    async handleGhostLinkCommand(type, payload) {
        if (type === 'SCAN') {
            const report = await this.recon.scanRelay(payload.target);
            console.log("⌬ [REPORT] Recon complete:", report);
            // In full version, this report would be encrypted and sent back via Kind 2026
        }
    }
}

const shell = new GhostShell();
shell.start();
