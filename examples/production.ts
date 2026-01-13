import { BattleNode, BattleNodeConfig } from '../src/index.js';

const config: BattleNodeConfig = {
    ip: '127.0.0.1',
    port: 2302,
    rconPassword: 'password',
    // Production settings
    timeout: 5000,
    maxRetries: 3,
    retryDelay: 1000,
    keepAliveInterval: 30000, // 30 seconds
    
    // Custom Logger
    logger: (level, message, meta) => {
        const timestamp = new Date().toISOString();
        if (meta) {
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta);
        } else {
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
        }
    },
    logLevel: 'debug'
};

const client = new BattleNode(config);

// Graceful Shutdown Handler
const shutdown = () => {
    console.log('Shutting down...');
    client.disconnect();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
    try {
        await client.login();
        console.log('Login successful');

        // Monitor stats every 10 seconds
        setInterval(() => {
            const stats = client.getStats();
            console.log('--- Client Stats ---');
            console.log(`Uptime: ${Math.floor(stats.uptime / 1000)}s`);
            console.log(`Commands Sent: ${stats.commandsSent}`);
            console.log(`Commands Failed: ${stats.commandsFailed}`);
            console.log(`Packets Lost: ${stats.packetsLost}`);
            console.log(`Avg Latency: ${stats.averageLatency}ms`);
            console.log('--------------------');
        }, 10000);

        // Execute commands
        const version = await client.getVersion();
        console.log(`Server Version: ${version}`);

        const players = await client.getPlayers();
        console.log(`Players:\n${players}`);

    } catch (err) {
        console.error('Fatal Error:', err);
        client.disconnect();
    }
}

main();
