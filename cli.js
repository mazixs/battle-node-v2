#!/usr/bin/env node
const BattleNode = require('./lib');
const readline = require('readline');

// Parse arguments: node cli.js <ip> <port> <password>
const args = process.argv.slice(2);

if (args.length < 3) {
    console.log('Usage: battle-rcon <ip> <port> <password>');
    console.log('Example: battle-rcon 127.0.0.1 2302 mypassword');
    process.exit(1);
}

const config = {
  ip: args[0],
  port: parseInt(args[1], 10),
  rconPassword: args[2]
};

const client = new BattleNode(config);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'RCON> '
});

console.log('--- DayZ BattlEye RCON CLI ---');
console.log(`Connecting to ${config.ip}:${config.port}...`);

// Handle Connection
client.login()
    .then(() => {
        console.log('Connected and Logged In!');
        console.log('Type commands below (e.g. "players", "bans", "say -1 Hello"). Type "exit" to quit.');
        rl.prompt();
    })
    .catch(err => {
        console.error('Login Failed:', err.message);
        process.exit(1);
    });

// Handle Server Messages (Chat, joins, etc.)
client.on('message', (msg) => {
    // Clear current line to avoid messing up the prompt
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(`[SERVER]: ${msg}`);
    rl.prompt(true);
});

client.on('disconnected', () => {
    console.log('\nDisconnected from server.');
    process.exit(0);
});

client.on('error', (err) => {
    console.error(`\nSocket Error: ${err.message}`);
});

// Handle User Input
rl.on('line', async (line) => {
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
    } catch (err) {
        console.error(`Error: ${err.message}`);
    }
    
    rl.prompt();
});

rl.on('close', () => {
    process.exit(0);
});
