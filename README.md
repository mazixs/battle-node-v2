# Battle Node v2

Battle Node v2 is a modern, Promise-based Node.js client for the BattlEye RCON protocol.
It supports standard BattlEye commands for games like ARMA 2, ARMA 3, DayZ, and others using the BE RCON protocol.

## Features

*   **Modern API**: Fully Promise-based (Async/Await).
*   **Reliable**: Handles UDP packet sequencing, multipart responses, and keep-alive automatically.
*   **Typed Helpers**: Built-in methods for common commands like `kick`, `ban`, `say`, `getPlayers`, etc.
*   **Flexible**: Can send any raw command supported by the server.

## Installation

```bash
npm install battle-node-v2
```

## Usage

### Basic Example

```javascript
const BattleNode = require('battle-node-v2');

const config = {
  ip: '127.0.0.1',
  port: 2302,
  rconPassword: 'your_password',
  timeout: 5000 // optional, default 5000ms
};

const client = new BattleNode(config);

(async () => {
  try {
    // 1. Connect
    await client.login();
    console.log('Connected!');

    // 2. Send Commands
    const players = await client.getPlayers();
    console.log('Players:', players);

    const bans = await client.getBans();
    console.log('Bans:', bans.length);

    // 3. Kick a player (ID 5)
    // await client.kick(5, 'High Ping');

    // 4. Send global message
    await client.say('Hello everyone!');

  } catch (err) {
    console.error('RCON Error:', err.message);
  } finally {
    process.exit(0);
  }
})();
```

### Events

*   `loginResponse`: Emitted when login succeeds or fails internally.
*   `message`: Emitted when the server sends a chat message or log (e.g., player joined, chat).
*   `disconnected`: Emitted when the connection is closed.
*   `error`: Emitted on socket errors.

```javascript
client.on('message', (msg) => {
    console.log('[SERVER]', msg);
});
```

## API Reference

### `client.login()`
Connects to the server and authenticates. Returns a `Promise<void>`.

### `client.sendCommand(command)`
Sends a raw command string to the server. Returns a `Promise<string>` with the response.
Handles multipart packets automatically.

### Helper Methods
All helper methods return a `Promise<string>`.

*   `getVersion()`
*   `getPlayers()`
*   `getBans()`
*   `getAdmins()`
*   `kick(playerId, [reason])`
*   `ban(playerId, [minutes], [reason])`
*   `addBan(identifier, [minutes], [reason])`
*   `removeBan(banId)`
*   `writeBans()`
*   `loadBans()`
*   `say(message, [playerId])` - playerId defaults to -1 (All)

## CLI Tool

This package includes a simple CLI for managing your server.

```bash
# Install globally to use the command
npm install -g battle-node-v2

# Usage
battle-rcon <ip> <port> <password>

# Example
battle-rcon 127.0.0.1 2302 mysecretpassword
```

Or run directly from the source:

```bash
node cli.js <ip> <port> <password>
```

### Available CLI Commands

Once connected, you can use any standard BattlEye command. Common commands include:

*   `players`: List all players on the server.
*   `admins`: List all connected RCON admins.
*   `bans`: List all bans.
*   `version`: Show the BattlEye server version.
*   `kick <ID> [Reason]`: Kick a player (e.g., `kick 5 AFK`).
*   `ban <ID> [Minutes] [Reason]`: Ban a player (0 minutes = permanent).
*   `addBan <GUID|IP> [Minutes] [Reason]`: Ban an offline player.
*   `removeBan <BanID>`: Unban a player (ID from `bans` list).
*   `say <ID> <Message>`: Send a chat message (`-1` for all players).
*   `loadBans`: Reload bans from file.
*   `writeBans`: Save bans to file.
*   `#lock` / `#unlock`: Lock or unlock the server.
*   `#shutdown`: Shutdown the server.
*   `exit` / `quit`: Disconnect and close the CLI.

## Protocol Details
This library implements the UDP-based BattlEye RCON protocol, including CRC32 checksums, packet sequencing, and multipacket reassembly.

## License
MIT
