/**
 * Protocol Constants
 */

export const PACKET_HEADER_BYTES = [0x42, 0x45] as const;
export const PACKET_HEADER = Buffer.from(PACKET_HEADER_BYTES); 
export const PACKET_HEADER_LENGTH = 2;
export const CRC_LENGTH = 4;
export const FF_MARKER = 0xFF;

export enum PacketType {
    Login = 0x00,
    Command = 0x01,
    Message = 0x02
}

export const DEFAULTS = {
    PORT: 2302,
    TIMEOUT: 5000,
    KEEPALIVE_INTERVAL: 15000
} as const;
