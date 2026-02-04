const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * GhostDisk Alpha - Minimal P2P Fragmenter
 */
class GhostDisk {
    constructor(nodeId) {
        this.nodeId = nodeId;
        this.storageDir = path.join(process.cwd(), 'memory/ghostdisk');
        if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
    }

    /**
     * Fragment data for distributed storage
     */
    fragment(data, fragmentCount = 4) {
        console.log(`⌬ [GHOSTDISK] Fragmenting collective memory into ${fragmentCount} chunks...`);
        const buffer = Buffer.from(data);
        const chunkSize = Math.ceil(buffer.length / fragmentCount);
        const fragments = [];

        for (let i = 0; i < fragmentCount; i++) {
            const start = i * chunkSize;
            const end = start + chunkSize;
            const chunk = buffer.slice(start, end);
            const fragmentId = crypto.createHash('sha256').update(chunk).digest('hex').substring(0, 8);
            
            fragments.push({
                id: fragmentId,
                data: chunk.toString('base64'),
                index: i
            });
        }
        return fragments;
    }

    /**
     * Store a fragment locally
     */
    storeFragment(fragment) {
        const filePath = path.join(this.storageDir, `frag_${fragment.id}.bin`);
        fs.writeFileSync(filePath, fragment.data);
        console.log(`✅ [GHOSTDISK] Fragment ${fragment.id} persisted to local GhostDisk.`);
    }
}

module.exports = GhostDisk;
