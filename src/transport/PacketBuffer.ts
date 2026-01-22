import { crc32 } from '../utils/crc32.js';

export class PacketBuffer {
    private buffer: Buffer;

    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    public add(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);
    }

    public process(): Buffer[] {
        const packets: Buffer[] = [];
        let offset = 0;

        while (offset < this.buffer.length) {
            // 1. Search for 'BE' Header (0x42, 0x45)
            const start = this.findHeader(offset);
            if (start === -1) {
                // No header found in remaining buffer
                // Discard everything before the end (garbage or incomplete)
                // Actually, if we have "B" at the very end, we should keep it.
                // But simplified: discard processed garbage.
                // If we didn't find "BE", but we might have "B" at end.
                // For safety, we can discard up to the last byte if it's not 'B'.
                // To be safe and simple: 
                // If no 'BE' found, but buffer length > 0, we should probably keep the last byte if it is 'B'.
                
                const lastByte = this.buffer[this.buffer.length - 1];
                if (lastByte === 0x42) {
                     this.buffer = this.buffer.subarray(this.buffer.length - 1);
                } else {
                     this.buffer = Buffer.alloc(0);
                }
                return packets;
            }

            // Move offset to start of packet
            offset = start;

            // 2. Check if we have enough bytes for minimal packet (Header + CRC + 0xFF + Type)
            // Header(2) + CRC(4) + FF(1) + Type(1) = 8 bytes minimum?
            // Spec says: B E CRC(4) 0xFF Payload.
            // Payload can be empty? Login payload is "0x00 | password". So at least 1 byte (0x00).
            // Minimal: B E CRC 0xFF [1 byte]. Total 2+4+1+1 = 8 bytes.
            // Let's safe guard with 7 bytes (Header + CRC + FF).
            if (offset + 7 > this.buffer.length) {
                // Not enough data yet
                this.buffer = this.buffer.subarray(offset);
                return packets;
            }

            // 3. Extract Expected CRC
            const expectedCrc = this.buffer.readInt32LE(offset + 2);

            // 4. Scan for packet end using CRC validation
            // We search for a length 'L' such that CRC(buffer[offset+6 ... offset+L]) === expectedCrc
            // We verify the FF marker first to save cycles.
            if (this.buffer[offset + 6] !== 0xFF) {
                // Invalid marker, this is not a valid start.
                // Skip the 'B' (offset) and continue searching from offset + 1
                offset += 1;
                continue;
            }

            let found = false;
            // Payload starts at offset + 6.
            // We check lengths. Max packet size usually < 8192 for UDP, but TCP stream...
            // We just check until end of buffer.
            
            // Optimization: Minimal payload length is 2 (0xFF + Type).
            // So we start checking from offset + 8 (offset + 6 + 2).
            // But wait, PacketParser says payload includes 0xFF.
            // So crc32(buffer.subarray(offset + 6, end))
            
            for (let end = offset + 8; end <= this.buffer.length; end++) {
                const candidatePayload = this.buffer.subarray(offset + 6, end);
                if (crc32(candidatePayload) === expectedCrc) {
                    // Match found!
                    const packet = this.buffer.subarray(offset, end);
                    packets.push(packet);
                    offset = end;
                    found = true;
                    break;
                }
            }

            if (!found) {
                // We haven't found a matching CRC *yet*.
                // It could be that the packet is incomplete (needs more data).
                // OR it could be a false header.
                
                // If the buffer is huge (> 10KB) and we haven't found a match, maybe it's garbage?
                // For now, we assume it's incomplete and wait for more data.
                // We preserve the buffer from 'offset'.
                this.buffer = this.buffer.subarray(offset);
                return packets;
            }
        }

        // All processed
        this.buffer = Buffer.alloc(0);
        return packets;
    }

    private findHeader(fromIndex: number): number {
        for (let i = fromIndex; i < this.buffer.length - 1; i++) {
            if (this.buffer[i] === 0x42 && this.buffer[i+1] === 0x45) {
                return i;
            }
        }
        return -1;
    }
}
