# API Reference

## BattleNode

The main client class for interacting with the BattlEye RCON server.

### Configuration (`BattleNodeConfig`)

| Property | Type | Default | Description |
|---|---|---|---|
| `ip` | `string` | **Required** | Server IP Address |
| `port` | `number` | **Required** | RCON Port |
| `rconPassword` | `string` | **Required** | RCON Password |
| `transportType` | `'udp' \| 'tcp'` | `'udp'` | Transport protocol |
| `timeout` | `number` | `5000` | Connection/Login timeout (ms) |
| `commandTimeout` | `number` | `5000` | Timeout for individual commands (ms) |
| `maxRetries` | `number` | `3` | Retries for failed commands |
| `retryDelay` | `number` | `1000` | Base retry delay (exponential backoff) |

### Core Methods

#### `login(): Promise<void>`
Establishes connection and authenticates with the server. Throws `RconError` on failure.

#### `disconnect(): void`
Closes the connection, stops the scheduler, and clears all timers.

#### `sendCommand(command: string): Promise<string>`
Sends a raw RCON command and returns the response.
*   **Queueing:** Commands are automatically queued and executed sequentially.
*   **Retries:** Automatically retries on timeout/failure based on config.

#### `getStats(): RconStats`
Returns current connection statistics:
*   `commandsSent`, `commandsFailed`, `packetsLost`, `averageLatency`, `uptime`, `isConnected`.

### Scheduler (`client.scheduler`)

Manage automated tasks directly within the client.

#### `addTask(id, interval, callback, options?)`
Registers a new task.

*   `id` (string): Unique identifier.
*   `interval` (string | number): Duration string (`'30s'`, `'1m'`) or ms.
*   `callback` (() => void | Promise\<void>): The function to execute.
*   `options`: `{ runImmediately: boolean }`

```typescript
// Example: Check bans every hour
client.scheduler.addTask('bans_sync', '1h', async () => {
    const bans = await client.getBans();
    await saveToDb(bans);
});
```

#### `removeTask(id: string): boolean`
Stops and removes a scheduled task.

### Typed Helper Methods

Shortcuts for common BattlEye commands:

*   `getPlayers(): Promise<string>`
*   `getBans(): Promise<string>`
*   `getAdmins(): Promise<string>`
*   `kick(playerId, reason): Promise<string>`
*   `ban(playerId, minutes, reason): Promise<string>`
*   `say(message, playerId?): Promise<string>` (Global or private message)
*   `loadBans()`, `writeBans()`

## Events

*   `'connected'`: Emitted after successful login.
*   `'disconnected'`: Emitted when connection is lost or closed.
*   `'message'`: Emitted when a server message (chat/log) is received.
*   `'error'`: Emitted on background errors (socket/transport).

