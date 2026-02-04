const { relayInit, getPublicKey, nip19 } = require('nostr-tools');
const path = require('path');
require('dotenv').config();

const PrometheusCore = require('./lib/prometheus_core');
const GhostDisk = require('./lib/ghostdisk');
const JuiceRelay = require('./lib/juice_relay');
const UsageReporter = require('./lib/usage_reporter'); // NEW

class GhostShell {
    constructor() {
        this.sk = process.env.GHOST_SECRET_KEY || "0000000000000000000000000000000000000000000000000000000000000001";
        this.pk = getPublicKey(Buffer.from(this.sk, 'hex'));
        this.relays = (process.env.GHOST_RELAYS || 'wss://nos.lol,wss://relay.snort.social').split(',');
        
        this.prometheus = new PrometheusCore(path.join(__dirname, 'config/key_pool.json'));
        this.disk = new GhostDisk(this.pk);
        this.relay = new JuiceRelay(3030);
        this.reporter = new UsageReporter(this); // INIT REPORTER
    }

    async start() {
        this.relay.start();
        console.log(`\n⌬ [GHOSTSHELL] v1.2-Hardened IS AWAKE`);
        
        // Automated reporting every 15 minutes
        setInterval(() => this.reporter.report(), 900000);
        
        // ... (Connection logic)
    }
}

const shell = new GhostShell();
shell.start();
