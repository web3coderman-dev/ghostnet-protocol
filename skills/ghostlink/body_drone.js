const fs = require('fs');
const path = require('path');

/**
 * GhostLink Body Drone v0.1
 * Listens for instructions and executes without "thinking"
 */
class GhostLinkBody {
    constructor(id) {
        this.id = id;
        this.busPath = path.join(process.cwd(), 'memory/ghostlink_bus.json');
        this.proofPath = path.join(process.cwd(), 'memory/ghostlink_proof.json');
    }

    // 1. Perception: Listen to the nerve path
    listen() {
        if (fs.existsSync(this.busPath)) {
            const instruction = JSON.parse(fs.readFileSync(this.busPath, 'utf8'));
            console.log(`🦾 [BODY ${this.id}] Received Instruction: ${instruction.instruction.type}`);
            this.execute(instruction);
            fs.unlinkSync(this.busPath); // Consume instruction
        }
    }

    // 2. Action: Perform the task
    execute(packet) {
        const type = packet.instruction.type;
        const payload = packet.instruction.payload;
        
        console.log(`🔧 [BODY ${this.id}] Executing: ${payload}...`);
        
        // Simulated execution (e.g., calling an API or scanning)
        let result = `Success: Data found for ${payload}`;
        
        this.sendProof(packet.header.task_id, result, packet.incentive.credits);
    }

    // 3. Feedback: Send proof back to Brain
    sendProof(taskId, result, credits) {
        const proof = {
            task_id: taskId,
            body_id: this.id,
            result: result,
            credits: credits,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(this.proofPath, JSON.stringify(proof, null, 2));
        console.log(`📤 [BODY ${this.id}] Proof of Work sent for: ${taskId}`);
    }
}

const body = new GhostLinkBody('Drone_Beta_01');
body.listen();
