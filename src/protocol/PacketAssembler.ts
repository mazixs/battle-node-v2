/**
 * Helper class to assemble multipart packets.
 * Handles timeouts for incomplete chunks to prevent memory leaks.
 */
import { PacketParser } from './PacketParser.js';

interface MultipartEntry {
    readonly sequence: number;
    readonly total: number;
    readonly parts: (Buffer | undefined)[];
    readonly timer: NodeJS.Timeout;
    readonly resolve: (fullBuffer: Buffer) => void;
    lastActivity: number;
}

export class PacketAssembler {
    // Map<SequenceID, MultipartEntry>
    private assemblyMap = new Map<number, MultipartEntry>();
    private readonly timeoutMs: number;

    constructor(timeoutMs: number = 3000) {
        this.timeoutMs = timeoutMs;
    }

    /**
     * Process a packet body that is identified as multipart.
     * @returns A Buffer if the packet completed assembly, otherwise null.
     */
    public handlePart(body: Buffer): Buffer | null {
        // Strict parse
        const header = PacketParser.parseMultipartHeader(body);
        const { sequence, total, index, data } = header;

        let entry = this.assemblyMap.get(sequence);

        if (!entry) {
            // New multipart sequence
            // We need a promise-like structure or just simple storage? 
            // Since this is synchronous processing of incoming packets, we just store state.
            // But we need to handle "Expiry" of this entry if it never completes.
            
            const timer = setTimeout(() => {
                this.cleanup(sequence);
            }, this.timeoutMs);

            entry = {
                sequence,
                total,
                parts: new Array<Buffer | undefined>(total),
                timer,
                resolve: () => {}, // Placeholder, not using promises here directly
                lastActivity: Date.now()
            };
            this.assemblyMap.set(sequence, entry);
        } else {
            // Reset timeout on activity
            entry.lastActivity = Date.now();
            entry.timer.refresh();
        }

        // Store the part
        if (index < entry.parts.length) {
            entry.parts[index] = data;
        }

        // Check completion
        if (this.isComplete(entry)) {
            const result = this.assemble(entry);
            this.cleanup(sequence);
            return result;
        }

        return null;
    }

    private isComplete(entry: MultipartEntry): boolean {
        for (let i = 0; i < entry.total; i++) {
            if (entry.parts[i] === undefined) {
                return false;
            }
        }
        return true;
    }

    private assemble(entry: MultipartEntry): Buffer {
        // Filter is strictly typed to exclude undefined, though isComplete checked it.
        const validParts = entry.parts.filter((p): p is Buffer => p !== undefined);
        return Buffer.concat(validParts);
    }

    private cleanup(sequence: number): void {
        const entry = this.assemblyMap.get(sequence);
        if (entry) {
            clearTimeout(entry.timer);
            this.assemblyMap.delete(sequence);
        }
    }

    public clear(): void {
        for (const [seq, entry] of this.assemblyMap) {
            clearTimeout(entry.timer);
        }
        this.assemblyMap.clear();
    }
}
