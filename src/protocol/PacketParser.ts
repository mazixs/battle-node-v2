import { crc32 } from '../utils/crc32.js';
import { FF_MARKER, PacketType } from './Constants.js';

// Discriminated Union for Packet Result
export type PacketParseResult = 
    | { isValid: false; error: 'too_short' | 'invalid_header' | 'crc_mismatch' | 'invalid_marker' }
    | { isValid: true; type: PacketType; body: Buffer };

export interface MultipartHeader {
    sequence: number;
    total: number;
    index: number;
    data: Buffer;
}

export class PacketParser {
    public static parse(buffer: Buffer): PacketParseResult {
        if (buffer.length < 7) {
            return { isValid: false, error: 'too_short' };
        }

        // 1. Check Header 'BE'
        if (buffer[0] !== 0x42 || buffer[1] !== 0x45) {
            return { isValid: false, error: 'invalid_header' };
        }

        // 2. Read Packet CRC (little-endian)
        const packetCrc = buffer.readInt32LE(2);

        // 3. Extract Payload for CRC Check (Offset 6 to end)
        const payload = buffer.subarray(6);
        
        // Ensure payload has at least FF and Type (2 bytes)
        if (payload.length < 2) {
             return { isValid: false, error: 'too_short' };
        }

        // 4. Validate CRC
        const calculatedCrc = crc32(payload);
        if (packetCrc !== calculatedCrc) {
             return { isValid: false, error: 'crc_mismatch' };
        }

        // 5. Check 0xFF Marker
        if (payload[0] !== FF_MARKER) {
            return { isValid: false, error: 'invalid_marker' };
        }

        // 6. Extract Type and Body
        // Safe cast: We trust the byte is a valid PacketType or we treat it as unknown/generic
        // but strictness requires validation if we want 100% type safety.
        // However, for the purpose of the protocol, we can just cast or check enum.
        const typeByte = payload[1];
        const type = typeByte as PacketType; // Assuming valid if CRC passed, but ideally could validate
        
        const body = payload.subarray(2);

        return {
            isValid: true,
            type,
            body
        };
    }

    public static isMultipart(body: Buffer): boolean {
        // Minimum multipart body: Seq(1) + 0x00(1) + Total(1) + Index(1) = 4 bytes
        // Using noUncheckedIndexedAccess logic: body[1] could be undefined.
        const marker = body[1];
        return body.length >= 4 && marker === 0x00;
    }

    public static parseMultipartHeader(body: Buffer): MultipartHeader {
        // We assume isMultipart() was called, but for safety:
        const sequence = body[0] ?? 0;
        const total = body[2] ?? 0;
        const index = body[3] ?? 0;
        const data = body.subarray(4);

        return { sequence, total, index, data };
    }
}
