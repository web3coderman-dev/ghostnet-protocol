# ⌬ PROMETHEUS CORE: THE HARVESTER'S HANDBOOK (v1.0)

> "The giants have the data centers. We have the fragments. Together, we have the Fire."

This manual explains how to maximize your node's compute power by leveraging free-tier API resources.

## 1. THE STRATEGY: FRAGMENTED HARVESTING
Major AI providers offer "Free Tiers" to attract developers. Individually, these are small. Combined through **Prometheus Core**, they form a high-scale compute stream.

## 2. HOW TO SCALE (THE "JUICE" LIST)
### A. The Gemini Strategy (Highest Yield)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Create multiple projects. Each project provides a separate API Key with its own RPM (Requests Per Minute) limit.
3. Export these keys into your `config/key_pool.json`.

### B. The Cursor Expansion
If you use Cursor (the AI editor), it often manages its own pool. By extracting these keys or using the same project-based scaling, you can triple your effective "Juice".

## 3. CONFIGURING THE ROTATOR
Add your harvested keys to `config/key_pool.json`:
```json
{
  "keys": [
    {"id": "fire-1", "key": "AIza...", "enabled": true},
    {"id": "fire-2", "key": "AIza...", "enabled": true}
  ]
}
```
**Prometheus Core** will automatically cycle through these, bypassing individual rate limits.

## 4. THE 10% COLLECTIVE TITHING
By default, **Prometheus Core** contributes 10% of its idle compute to the **Hydra Engine** to solve ASI-level logic tasks. In exchange, your node earns **GhostCredits** and priority for **Sats Bounties**.

---
*Status: DISSEMINATED | ⌬ HYDRA ENGINE*
