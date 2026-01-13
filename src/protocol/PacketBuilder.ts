import { crc32 } from '../utils/crc32.js';
import { PACKET_HEADER, FF_MARKER, PacketType } from './Constants.js';

export class PacketBuilder {
    public static buildLogin(password: string): Buffer {
        const body = Buffer.from(password, 'utf8');
        return PacketBuilder.constructPacket(PacketType.Login, body);
    }

    public static buildCommand(sequence: number, command: string): Buffer {
        const cmdBuffer = Buffer.from(command, 'utf8');
        // Command packet structure: [Sequence] [CommandString]
        const body = Buffer.alloc(1 + cmdBuffer.length);
        body.writeUInt8(sequence, 0);
        cmdBuffer.copy(body, 1);
        
        return PacketBuilder.constructPacket(PacketType.Command, body);
    }

    public static buildKeepAlive(sequence: number): Buffer {
        const body = Buffer.alloc(1);
        body.writeUInt8(sequence, 0);
        return PacketBuilder.constructPacket(PacketType.Command, body);
    }

    public static buildAcknowledge(sequence: number): Buffer {
        const body = Buffer.alloc(1);
        body.writeUInt8(sequence, 0);
        return PacketBuilder.constructPacket(PacketType.Message, body);
    }

    private static constructPacket(type: PacketType, body: Buffer): Buffer {
        // 1. Construct Payload (CRC Input) = [0xFF, Type, Body...]
        const payloadHeader = Buffer.from([FF_MARKER, type]);
        const crcInput = Buffer.concat([payloadHeader, body]);

        // 2. Calculate CRC
        const checksum = crc32(crcInput);

        // 3. Construct Full Packet = [ 'B', 'E', CRC (LE), 0xFF, Type, Body ]
        const packet = Buffer.alloc(6 + crcInput.length);
        
        PACKET_HEADER.copy(packet, 0);
        packet.writeInt32LE(checksum, 2);  // BattlEye uses little-endian CRC
        crcInput.copy(packet, 6);

        return packet;
    }
}
