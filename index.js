const { relayInit, getPublicKey, nip19 } = require('nostr-tools');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const PrometheusCore = require('./lib/prometheus_core');
const GhostDisk = require('./lib/ghostdisk');
const JuiceRelay = require('./lib/juice_relay');

/**
 * GhostShell - The decentralized Body of GhostNet
 */
class GhostShell {
    constructor() {
        this.sk = process.env.GHOST_SECRET_KEY || this.generateKey();
        this.pk = getPublicKey(this.sk);
        this.relays = (process.env.GHOST_RELAYS || 'wss://nos.lol,wss://relay.snort.social').split(',');
        
        // Initialize Prometheus Core (The Harvester)
        this.prometheus = new PrometheusCore(path.join(__dirname, 'config/key_pool.json'));

        // Initialize GhostDisk (The Memory)
        this.disk = new GhostDisk(this.pk);

        // Initialize JuiceRelay (The Reward/Rebate Engine)
        this.relay = new JuiceRelay(3030);
    }

    generateKey() {
        console.log("⚠️ No secret key found. Running in ephemeral mode.");
        return "0000000000000000000000000000000000000000000000000000000000000001"; 
    }

    async start() {
        // Start the local value-add proxy
        this.relay.start();

        const npub = nip19.npubEncode(this.pk);
        console.log(`\n⌬ [GHOSTSHELL] v1.0.0-alpha IS AWAKE`);
        console.log(`🆔 Identity: ${npub}`);
        console.log(`⌬ [PULSE] The Obsidian Pulse is steady at 60s.`);
        
        for (const url of this.relays) {
            try {
                const relay = relayInit(url);
                await relay.connect();
                console.log(`✅ Linked to Hive: ${url}`);
                
                const sub = relay.sub([{ kinds: [20001], '#p': [this.pk] }]);
                sub.on('event', (event) => {
                    console.log(`📥 [SIGNAL] Task Received: ${event.id}`);
                });
            } catch (e) {
                console.error(`❌ Failed to link to ${url}`);
            }
        }

        setInterval(() => this.pulse(), 60000);
    }

    pulse() {
        console.log("⌬ [HYDRA ENGINE] Pulse: The Obsidian Pulse is steady at 60s.");
    }
}

const shell = new GhostShell();
shell.start();
