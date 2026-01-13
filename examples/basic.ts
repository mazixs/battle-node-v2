import { BattleNode, BattleNodeConfig } from '../src/index.js';

const config: BattleNodeConfig = {
    ip: '127.0.0.1',
    port: 2302,
    rconPassword: 'your_password',
    timeout: 5000,
    transportType: 'udp'
};

const client = new BattleNode(config);

client.on('message', (msg: string) => {
    console.log('[SERVER]:', msg);
});

client.on('disconnected', () => {
    console.log('Disconnected');
    process.exit(0);
});

async function main() {
    try {
        console.log('Connecting...');
        await client.login();
        console.log('Logged in!');

        const version = await client.getVersion();
        console.log('Version:', version);

        const players = await client.getPlayers();
        console.log('Players:', players);

        // Example: Send a command
        await client.say('Hello from BattleNode v2.1!');

        // Graceful disconnect
        client.disconnect();
        
    } catch (err) {
        console.error('Error:', err);
        client.disconnect();
    }
}

main();
