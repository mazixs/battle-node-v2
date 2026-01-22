# Battle Node v2.1

Battle Node v2.1 is a modern, **TypeScript-based** Node.js client for the BattlEye RCON protocol.
It supports standard BattlEye commands for games like ARMA 2, ARMA 3, DayZ, and others.

> **Target:** Node.js 22+ (Native ESM, Built-in Test Runner, Native Arg Parsing)

## Features

*   **TypeScript**: Written in strict TypeScript (ES2023) with full type definitions.
*   **Zero Dependencies**: Uses only native Node.js APIs (`net`, `dgram`, `events`, `util`).
*   **Native Scheduler**: Built-in task runner for automated commands (Anti-overlap, Human-readable intervals).
*   **Reliable UDP**: Automatic retries with exponential backoff, command queuing, and multipart packet reassembly.
*   **Multi-Transport**: Supports **UDP** (standard) and **TCP** (proxy) with correct stream framing.
*   **Observability**: Built-in statistics (`getStats()`) and structured logging.

## Documentation

*   [📚 API Reference](./docs/API.md) - Methods, Configuration, and Events.
*   [🏗 Architecture & Internals](./docs/Architecture.md) - Design principles and transport logic.

## Installation

```bash
npm install battle-node-v2
```

**Note**: This package is purely **ESM**. You must use `import` syntax and have `"type": "module"` in your project's `package.json`.

## Usage

### Basic Example

```typescript
import { BattleNode, BattleNodeConfig } from 'battle-node-v2';

const config: BattleNodeConfig = {
  ip: '127.0.0.1',
  port: 2302,
  rconPassword: 'your_password'
};

const client = new BattleNode(config);

try {
  await client.login();
  console.log('Logged in!');
  
  // Use typed helper methods
  const players = await client.getPlayers();
  console.log('Players:', players);
  
  // Scheduler Example: Auto-save every 10 minutes
  client.scheduler.addTask('auto_save', '10m', async () => {
      console.log('Saving server...');
      await client.sendCommand('#save');
  });

} catch (error) {
  console.error('RCON Error:', error);
  client.disconnect();
}
```

### Production Ready Example

This example demonstrates retry logic, custom logging, and graceful shutdown.

```typescript
import { BattleNode, BattleNodeConfig } from 'battle-node-v2';

const config: BattleNodeConfig = {
  ip: '192.168.1.144',
  port: 2302,
  rconPassword: 'your_password',
  
  // Reliability Settings
  timeout: 5000,          // Connection timeout
  maxRetries: 3,         // Retry commands up to 3 times
  retryDelay: 1000,      // Exponential backoff base delay
  
  // Custom Logging
  logLevel: 'info',
  logger: (level, msg, meta) => {
     const timestamp = new Date().toISOString();
     console.log(`[${timestamp}] [${level.toUpperCase()}] ${msg}`, meta || '');
  }
};

const client = new BattleNode(config);

client.on('message', (msg) => console.log('[SERVER]:', msg));
client.on('disconnected', () => console.log('Disconnected from server'));

async function main() {
  try {
    await client.login();
    console.log('RCON Connected');

    // Auto-Announce every 2 hours
    client.scheduler.addTask('announcer', '2h', async () => {
        await client.say('Join our Discord!');
    });

  } catch (err) {
    console.error('Failed to connect:', err);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGINT', () => {
    client.disconnect(); // Stops scheduler and closes socket
    process.exit(0);
});

main();
```

## CLI Tool

The package includes a built-in CLI for quick server management using native argument parsing.

```bash
# Run directly with npx
npx battle-node-v2 -i 127.0.0.1 -p 2302 -P mypassword

# Or install globally
npm install -g battle-node-v2
battle-rcon --ip 192.168.1.144 --port 2302 --password mypassword
```

## License

MIT

