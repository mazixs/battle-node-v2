const BattleNode = require('./lib');
const fs = require('fs');

const config = {
  ip: '127.0.0.1',
  port: 2305,
  rconPassword: 'your_password'
};

const bnode = new BattleNode(config);

bnode.on('disconnected', () => {
  console.log('RCON server disconnected.');
  process.exit(0);
});

// Message listener for server messages (chat, etc.)
bnode.on('message', (message) => {
  console.log('Server Message:', message);
});

(async () => {
  try {
    console.log('Connecting...');
    await bnode.login();
    console.log('Logged in successfully!');

    // Get Version
    const version = await bnode.getVersion();
    console.log('BattlEye Version:', version);

    // Get Bans
    const bans = await bnode.getBans();
    // Note: We can now choose to save it or just print it. 
    // The library no longer forces us to save files.
    console.log('Bans received (length):', bans.length);
    if (bans.length > 0) {
        fs.writeFileSync('bans.txt', bans);
        console.log('Saved bans to bans.txt');
    }

    // Get Players
    const players = await bnode.getPlayers();
    console.log('Players:');
    console.log(players);

    // Disconnect properly (by exiting, or we could add a logout method)
    // For this example, we'll wait a bit then exit
    setTimeout(() => {
        console.log('Done.');
        process.exit(0);
    }, 2000);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
