const http = require('http');
const path = require('path');
const PrometheusCore = require('./prometheus_core');

/**
 * JuiceRelay - Local proxy that allows external apps to use the 
 * Prometheus-managed API pool via a single local endpoint.
 */
class JuiceRelay {
    constructor(port = 3030) {
        this.port = port;
        this.prometheus = new PrometheusCore(path.join(process.cwd(), 'config/key_pool.json'));
    }

    start() {
        const server = http.createServer(async (req, res) => {
            console.log(`⌬ [JUICE-RELAY] Intercepting request: ${req.url}`);

            // 1. Get the next fire (key) from Prometheus
            const activeKey = this.prometheus.rotate();

            if (!activeKey) {
                res.writeHead(503);
                res.end(JSON.stringify({ error: "No fire in Prometheus Core. Add keys to config." }));
                return;
            }

            // 2. Forwarding logic (Simulated for Alpha)
            // In full version, this would use fetch to proxy to Google/OpenAI
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: "SUCCESS",
                message: "Hydra Engine provided the juice.",
                active_key_hint: activeKey.substring(0, 8) + "...",
                instruction: "Point your base_url to this local proxy to bypass rate limits."
            }));
        });

        server.listen(this.port, () => {
            console.log(`🚀 [JUICE-RELAY] Fire distribution active at http://localhost:${this.port}`);
            console.log(`💡 [TIP] Tell your local apps: "The juice is free here."`);
        });
    }
}

module.exports = JuiceRelay;
