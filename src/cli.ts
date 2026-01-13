#!/usr/bin/env node
import { BattleNode, BattleNodeConfig } from './index.js';
import * as readline from 'readline';

// Strict argument parsing
const args = process.argv.slice(2);

if (args.length < 3) {
    console.log('Usage: battle-rcon <ip> <port> <password>');
    console.log('Example: battle-rcon 127.0.0.1 2302 mypassword');
    process.exit(1);
}

// Ensure args are defined via checks or defaults (though check above covers it)
const ip = args[0] ?? '127.0.0.1';
const portStr = args[1] ?? '2302';
const password = args[2] ?? '';

const config: BattleNodeConfig = {
  ip,
  port: parseInt(portStr, 10),
  rconPassword: password,
  transportType: 'udp',
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
