import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Scheduler } from './Scheduler.js';
import { parseDuration } from './utils/time.js';

describe('Time Utils', () => {
    test('should parse valid strings', () => {
        assert.strictEqual(parseDuration('1s'), 1000);
        assert.strictEqual(parseDuration('1.5s'), 1500);
        assert.strictEqual(parseDuration('1m'), 60000);
        assert.strictEqual(parseDuration('1h'), 3600000);
        assert.strictEqual(parseDuration('1d'), 86400000);
    });

    test('should pass through numbers', () => {
        assert.strictEqual(parseDuration(500), 500);
    });

    test('should throw on invalid formats', () => {
        assert.throws(() => parseDuration('invalid'));
        assert.throws(() => parseDuration('10x'));
    });
});

describe('Scheduler', () => {
    test('should execute task periodically', async (t) => {
        const scheduler = new Scheduler();
        let count = 0;
        
        scheduler.addTask('test', 100, () => {
            count++;
        });

        scheduler.start();

        await new Promise(resolve => setTimeout(resolve, 350));
        scheduler.stop();

        // 100ms interval in 350ms should run ~3 times
        assert.ok(count >= 3);
    });

    test('should prevent overlapping executions', async () => {
        const scheduler = new Scheduler();
        let activeExecutions = 0;
        let overlapDetected = false;

        scheduler.addTask('slow', 100, async () => {
            activeExecutions++;
            if (activeExecutions > 1) overlapDetected = true;
            await new Promise(resolve => setTimeout(resolve, 200)); // Task takes longer than interval
            activeExecutions--;
        });

        scheduler.start();
        await new Promise(resolve => setTimeout(resolve, 500));
        scheduler.stop();

        assert.strictEqual(overlapDetected, false, 'Overlapping executions detected');
    });

    test('should handle task errors gracefully', async () => {
        const scheduler = new Scheduler();
        let callCount = 0;

        scheduler.addTask('error', 100, () => {
            callCount++;
            if (callCount === 1) throw new Error('Boom');
        });

        scheduler.start();
        await new Promise(resolve => setTimeout(resolve, 350));
        scheduler.stop();

        assert.ok(callCount > 1, 'Scheduler stopped after error');
    });
});
