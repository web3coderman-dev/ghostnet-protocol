const axios = require('axios');

/**
 * LocalModelDriver - Interface for sovereign local compute (Llama.cpp / vLLM).
 */
class LocalModelDriver {
    constructor(endpoint = 'http://localhost:8080') {
        this.endpoint = endpoint;
    }

    async generate(prompt) {
        console.log("⌬ [LOCAL-MODEL] Engaging local sovereign neurons...");
        try {
            // Standard OpenAI-compatible local endpoint call
            const response = await axios.post(`${this.endpoint}/v1/chat/completions`, {
                model: "local-model",
                messages: [{ role: "user", content: prompt }]
            });
            
            return {
                source_type: 'SOVEREIGN',
                content: response.data.choices[0].message.content,
                tokens: response.data.usage.total_tokens
            };
        } catch (e) {
            console.error(`❌ [LOCAL-MODEL] Local neuron failure: ${e.message}`);
            return null;
        }
    }
}

module.exports = LocalModelDriver;
