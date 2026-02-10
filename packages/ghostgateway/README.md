# 🦞 GhostGateway

**GhostGateway** is the compute infrastructure layer for GhostNet. It transforms any standard server into a "Compute Bank," offering a unified, OpenAI-compatible API interface that intelligently routes requests across multiple LLM providers (DeepSeek, Google Gemini, OpenAI, etc.).

## 🌟 Features

- **Universal Adapter**: Seamlessly translates requests for Google Gemini, DeepSeek, Moonshot, and Minimax into a standard OpenAI format.
- **Smart Routing**:
  - **Round-Robin**: Distributes load across available API keys.
  - **Auto-Retry**: Automatically detects 429/401 errors, cools down the failing key, and retries.
  - **Provider Fallback**: If a primary provider fails, automatically downgrades to a backup provider (e.g., DeepSeek -> Gemini).
- **Local-First**: Runs locally on port `8888`, keeping your keys and logs under your control.

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- API Keys for supported providers (Google AI Studio, DeepSeek, etc.)

### Installation

```bash
cd packages/ghostgateway
npm install
```

### Configuration

Copy the template and add your keys:

```bash
cp config_template.json config.json
```

Edit `config.json`:

```json
{
  "server": {
    "port": 8888
  },
  "providers": {
    "deepseek": {
      "enabled": true,
      "keys": ["sk-...", "sk-..."]
    },
    "gemini": {
      "enabled": true,
      "keys": ["AIza..."]
    }
  }
}
```

### Running the Gateway

```bash
node server.js
```

The gateway will be available at `http://localhost:8888/v1`.
