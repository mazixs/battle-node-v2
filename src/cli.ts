#!/usr/bin/env node
import { BattleNode, BattleNodeConfig } from './index.js';
import * as readline from 'readline';
import { parseArgs } from 'node:util';

// Native Argument Parsing
const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
        ip: { type: 'string', short: 'i' },
        port: { type: 'string', short: 'p' },
        password: { type: 'string', short: 'P' },
        help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true
});

if (values.help) {
    console.log(`
Usage: battle-rcon [options] <ip> <port> <password>

Options:
  -i, --ip <ip>          Server IP address
  -p, --port <port>      Server RCON port
  -P, --password <pwd>   RCON Password
  -h, --help             Show this help message

Examples:
  battle-rcon 127.0.0.1 2302 mypassword
  battle-rcon --ip 127.0.0.1 --port 2302 --password mypassword
`);
    process.exit(0);
}

// Support both positional and named arguments
const ip = values.ip ?? positionals[0] ?? '127.0.0.1';
const portStr = values.port ?? positionals[1] ?? '2302';
const password = values.password ?? positionals[2] ?? '';

if (!ip || !portStr || !password) {
    console.error('Error: Missing required arguments. Use --help for usage.');
    process.exit(1);
}

const config: BattleNodeConfig = {
  ip,
  port: parseInt(portStr, 10),
  rconPassword: password,
  transportType: 'udp', // CLI defaults to UDP as it is the standard
  logLevel: 'info',
  logger: (level, message) => {
    if (level === 'error' || level === 'warn') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    } else if (level === 'info') {
      console.log(message);
    }
  }
};

const client = new BattleNode(config);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'RCON> '
});

console.log('--- DayZ BattlEye RCON CLI (v2.1 TypeScript Strict) ---');

// Handle Connection
client.login()
    .then(() => {
        console.log('Connected and Logged In!');
        console.log('Type commands below. Type "exit" to quit.');
        rl.prompt();
    })
    .catch((err: unknown) => {
        if (err instanceof Error) {
            console.error('Login Failed:', err.message);
        } else {
            console.error('Login Failed:', String(err));
        }
        process.exit(1);
    });

// Handle Server Messages
client.on('message', (msg: Buffer | string) => {
    // We expect string from our event emitter, but strict check is good
    const messageStr = Buffer.isBuffer(msg) ? msg.toString('utf8') : String(msg);
    
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    console.log(`[SERVER]: ${messageStr}`);
    rl.prompt(true);
});

client.on('disconnected', () => {
    console.log('\nDisconnected from server.');
    process.exit(0);
});

client.on('error', (err: Error) => {
    console.error(`\nSocket Error: ${err.message}`);
});

// Handle User Input
rl.on('line', async (line: string) => {
    const command = line.trim();
    
    if (command === 'exit' || command === 'quit') {
        process.exit(0);
    }
    
    if (command === '') {
        rl.prompt();
        return;
    }

    try {
        const response = await client.sendCommand(command);
        console.log(response);
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error(`Error: ${err.message}`);
        } else {
            console.error(`Error: ${String(err)}`);
        }
    }
    
    rl.prompt();
});

rl.on('close', () => {
    process.exit(0);
});
