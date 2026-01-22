import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PacketBuffer } from './PacketBuffer.js';
import { PacketBuilder } from '../protocol/PacketBuilder.js';

describe('PacketBuffer', () => {
    test('should reassemble a single complete packet', () => {
        const buffer = new PacketBuffer();
        const packet = PacketBuilder.buildCommand(1, 'test');
        
        buffer.add(packet);
        const result = buffer.process();
        
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], packet);
    });

    test('should reassemble a packet split into two chunks', () => {
        const buffer = new PacketBuffer();
        const packet = PacketBuilder.buildCommand(2, 'fragmented');
        
        const chunk1 = packet.subarray(0, 5);
        const chunk2 = packet.subarray(5);
        
        buffer.add(chunk1);
        let result = buffer.process();
        assert.strictEqual(result.length, 0); // No packet yet
        
        buffer.add(chunk2);
        result = buffer.process();
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], packet);
    });

    test('should reassemble multiple packets in a single chunk', () => {
        const buffer = new PacketBuffer();
        const packet1 = PacketBuilder.buildCommand(3, 'first');
        const packet2 = PacketBuilder.buildCommand(4, 'second');
        
        const combined = Buffer.concat([packet1, packet2]);
        
        buffer.add(combined);
        const result = buffer.process();
        
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0], packet1);
        assert.deepStrictEqual(result[1], packet2);
    });

    test('should handle garbage before valid packet', () => {
        const buffer = new PacketBuffer();
        const packet = PacketBuilder.buildCommand(5, 'valid');
        const garbage = Buffer.from('garbage data');
        
        buffer.add(garbage);
        buffer.add(packet);
        
        const result = buffer.process();
        
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], packet);
    });

    test('should handle split "BE" header', () => {
        const buffer = new PacketBuffer();
        const packet = PacketBuilder.buildCommand(6, 'split header');
        
        // Split specifically between 'B' and 'E'
        // Header is 'BE' at index 0, 1.
        const chunk1 = packet.subarray(0, 1); // 'B'
        const chunk2 = packet.subarray(1);    // 'E...'
        
        buffer.add(chunk1);
        let result = buffer.process();
        assert.strictEqual(result.length, 0);
        
        buffer.add(chunk2);
        result = buffer.process();
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], packet);
    });
});
