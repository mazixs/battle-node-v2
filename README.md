# Battle Node v2.1

Battle Node v2.1 is a modern, **TypeScript-based** Node.js client for the BattlEye RCON protocol.
It supports standard BattlEye commands for games like ARMA 2, ARMA 3, DayZ, and others.

## Features

*   **TypeScript**: Written in strict TypeScript (ES2023) with full type definitions.
*   **Reliable UDP**: Automatic retries with exponential backoff, command queuing, and multipart packet reassembly.
*   **Multi-Transport**: Supports **UDP** (standard) and **TCP** (proxy) transports.
*   **Observability**: Built-in statistics (`getStats()`) and structured logging.
*   **Robust Protocol**: Handles sequencing, CRC32 validation (Little-Endian), and keep-alive automatically.
*   **Zero Dependencies**: Lightweight and efficient.

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
  
  const players = await client.sendCommand('players');
  console.log('Players:', players);
  
  // Use typed helper methods
  const version = await client.getVersion();
  console.log('Server Version:', version);

} catch (error) {
  console.error('RCON Error:', error);
} finally {
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
  keepAliveInterval: 30000,
  
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

    // Stats Monitoring
    setInterval(() => {
        const stats = client.getStats();
        console.log(`Latency: ${stats.averageLatency}ms | Lost: ${stats.packetsLost}`);
    }, 60000);

  } catch (err) {
    console.error('Failed to connect:', err);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGINT', () => {
    client.disconnect();
    process.exit(0);
});

main();
```

## Configuration

The `BattleNodeConfig` interface:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ip` | `string` | **Required** | Game server IP address |
| `port` | `number` | **Required** | RCON port (often Game Port + 1) |
| `rconPassword` | `string` | **Required** | BattlEye RCON password |
| `transportType` | `'udp' \| 'tcp'` | `'udp'` | Use UDP for direct connection |
| `timeout` | `number` | `5000` | Socket/Login timeout (ms) |
| `maxRetries` | `number` | `3` | Max retries for failed commands |
| `retryDelay` | `number` | `1000` | Base delay for retries (ms) |
| `keepAliveInterval` | `number` | `15000` | Keep-alive packet interval (ms) |
| `logLevel` | `'debug'\|'info'\|'warn'\|'error'` | `'info'` | Minimum log level |
| `logger` | `function` | `undefined` | Custom logger callback |

## CLI Tool

The package includes a built-in CLI for quick server management.

```bash
# Run directly with npx
npx battle-node-v2 <ip> <port> <password>

# Or install globally
npm install -g battle-node-v2
battle-rcon 192.168.1.144 2302 mypassword
```

## Protocol Details

This library implements the full BattlEye RCON protocol v2, including:
- **Login Handshake**: Secure authentication with password.
- **Multipart Packets**: Automatically reassembles split responses.
- **CRC32 Integrity**: Validates all incoming packets using correct Little-Endian checksums.
- **Sequence Tracking**: Ensures commands are executed in order.

## License

MIT

