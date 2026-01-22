/**
 * Simple utility to parse human-readable time strings into milliseconds.
 * Supported units: s (seconds), m (minutes), h (hours), d (days).
 * Example: "10s" -> 10000, "1.5m" -> 90000
 */
export function parseDuration(input: string | number): number {
    if (typeof input === 'number') return input;

    const regex = /^(\d+(?:\.\d+)?)([smhd])$/;
    const match = input.toLowerCase().match(regex);

    if (!match) {
        throw new Error(`Invalid duration format: "${input}". Use format like '10s', '5m', '1h'.`);
    }

    const value = parseFloat(match[1] ?? '0');
    const unit = match[2];

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return value; // Should be unreachable due to regex
    }
}
