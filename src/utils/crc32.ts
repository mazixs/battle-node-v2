/**
 * CRC32 implementation using a precomputed lookup table.
 */
const CRC_TABLE = new Int32Array(256);

(() => {
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        CRC_TABLE[n] = c;
    }
})();

/**
 * Calculates the CRC32 checksum of a buffer.
 * @returns Signed 32-bit integer matching BattlEye protocol expectations.
 */
export function crc32(buffer: Buffer): number {
    let crc = -1;
    for (const byte of buffer) {
        const index = (crc ^ byte) & 0xFF;
        const lookup = CRC_TABLE[index];
        // With noUncheckedIndexedAccess, lookup might be undefined.
        // Since index is guaranteed 0-255, we can safe-guard with ?? 0
        crc = (crc >>> 8) ^ (lookup ?? 0);
    }
    return crc ^ -1;
}
