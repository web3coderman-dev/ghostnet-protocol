# GhostGateway V2.0 Roadmap

**Goal:** Transform GhostGateway from a simple LLM proxy into a "Compute Bank" & "Decentralized Exchange Terminal" for the GhostNet ecosystem.

## 🟢 Phase 1: The Foundation (Core Proxy)
> *Status: ✅ Completed*

- [x] **Universal Adapter**: Support Google Gemini, OpenAI (DeepSeek/Moonshot/Minimax) protocols.
- [x] **Local Server**: Running on `http://localhost:8888/v1` (OpenAI Compatible).
- [x] **Smart Router**:
    - [x] Round-robin key selection.
    - [x] **Smart Retry**: Auto-detect 429/401 errors and cooldown keys.
    - [x] **Provider Fallback**: Auto-downgrade (DeepSeek -> Gemini) on failure.

## 🟡 Phase 2: Financial Infrastructure (DePIN Layer)
> *Status: 🚧 In Progress (Next Priority)*

### 2.1 The Ledger (Local Accounting)
- [ ] **`ledger.js`**: Intercept every request and log metadata.
    - Fields: `timestamp`, `provider`, `model`, `key_id`, `tokens_in`, `tokens_out`.
    - **Cost Calculation**: Estimate Sats cost based on market rates (e.g. DeepSeek $0.2/M).
    - **Output**: Real-time `ledger.json` for local auditing.

### 2.2 The Probe (Asset Verification)
- [ ] **`probe.js`**: Active health-check for API Keys.
    - **Tier Detection**: Detect Free vs. Paid tiers (via RPM headers).
    - **Balance Check**: Verify if the key has sufficient funds (prevent 402 errors).
    - **Tagging**: Auto-tag keys in `config.json` (e.g., `tier: "gold"`, `tier: "free"`).

### 2.3 Tiered Routing Algorithm
- [ ] Upgrade `smart_manager.js` to support weighted routing:
    - Priority 1: Free Tier (High Performance).
    - Priority 2: Local Models (Zero Cost).
    - Priority 3: Paid Tier (High Performance) - *Only if task requires it*.

## 🔴 Phase 3: Decentralized Economy (The Protocol)
> *Status: 📅 Planned*

### 3.1 Verification (Proof of Wisdom)
- [ ] **`validator.js`**: Quality assurance module.
    - **Format Check**: JSON Schema / Code syntax validation.
    - **Vector Fingerprint**: Check semantic relevance against Prompt.
    - **Logic Check**: Verify reasoning steps for complex tasks.

### 3.2 Service Discovery (Nostr)
- [ ] **Broadcast Script**: Publish `Kind 31990` (Handler Information).
    - Announce: "GhostNode Online. Offering DeepSeek V3 @ 50 Sats/1k".
- [ ] **Scanner**: Listen for `Kind 31990` from other nodes to populate dynamic routing tables.

### 3.3 Settlement (Lightning Network)
- [ ] **NWC Integration**: Connect to Nostr Wallet Connect.
- [ ] **Auto-Zap**: Trigger Lightning payments upon successful `validator.js` checks.
- [ ] **Paywall**: Verify LSAT (Lightning Service Authentication Token) for incoming requests.

---
*Last Updated: 2026-02-06*
