const dgram = require('dgram');
const EventEmitter = require('events');
const crc32 = require('buffer-crc32');

// Constants
const PACKET_HEAD = Buffer.from([0x42, 0x45]); // 'BE'
const TYPE_LOGIN = 0x00;
const TYPE_COMMAND = 0x01;
const TYPE_MESSAGE = 0x02;

class BattleNode extends EventEmitter {
    constructor(config) {
        super();
        this.config = Object.assign({
            ip: '127.0.0.1',
            port: 2302,
            rconPassword: '',
            timeout: 5000,
            keepAliveInterval: 15000 
        }, config);

        this.socket = dgram.createSocket('udp4');
        this.sequence = 0;
        this.connected = false;
        this.loginPromise = null;
        
        // Command queue: Map<sequence, { resolve, reject, timer, multipart: [] }>
        this.pendingCommands = new Map();
        
        this.keepAliveTimer = null;

        this._setupSocket();
    }

    _setupSocket() {
        this.socket.on('message', (msg, rinfo) => this._handleMessage(msg, rinfo));
        this.socket.on('error', (err) => this.emit('error', err));
        this.socket.on('close', () => {
            this.connected = false;
            this._stopKeepAlive();
            this.emit('disconnected');
        });
    }

    /**
     * Establish connection and login to RCON.
     * @returns {Promise<void>}
     */
    login() {
        if (this.loginPromise) return this.loginPromise;

        this.loginPromise = new Promise((resolve, reject) => {
            // Prepare login packet
            // Login Packet: 'B' 'E' [CRC32] 0xFF 0x00 [Password]
            const payload = Buffer.concat([
                Buffer.from([0xFF, TYPE_LOGIN]),
                Buffer.from(this.config.rconPassword)
            ]);
            
            this._send(payload);

            // Set a timeout for login
            const timeout = setTimeout(() => {
                this.loginPromise = null;
                reject(new Error('Login timeout'));
            }, this.config.timeout);

            // Temporary listener for login response
            const responseHandler = (success) => {
                clearTimeout(timeout);
                this.removeListener('loginResponse', responseHandler);
                
                if (success) {
                    this.connected = true;
                    this._startKeepAlive();
                    resolve();
                } else {
                    this.loginPromise = null;
                    reject(new Error('Invalid RCON password'));
                }
            };

            this.on('loginResponse', responseHandler);
        });

        return this.loginPromise;
    }

    /**
     * Send a command to the server and wait for response.
     * @param {string} command 
     * @returns {Promise<string>}
     */
    sendCommand(command) {
        if (!this.connected) return Promise.reject(new Error('Not connected'));

        return new Promise((resolve, reject) => {
            const seq = this._nextSequence();
            
            // Command Packet: 'B' 'E' [CRC32] 0xFF 0x01 [Sequence] [Command]
            const cmdBuffer = Buffer.from(command, 'utf8');
            const payload = Buffer.alloc(3 + cmdBuffer.length);
            payload.writeUInt8(0xFF, 0);
            payload.writeUInt8(TYPE_COMMAND, 1);
            payload.writeUInt8(seq, 2);
            cmdBuffer.copy(payload, 3);

            this.pendingCommands.set(seq, {
                resolve,
                reject,
                multipart: [],
                timer: setTimeout(() => {
                    if (this.pendingCommands.has(seq)) {
                        this.pendingCommands.delete(seq);
                        reject(new Error(`Command '${command}' timed out`));
                    }
                }, this.config.timeout)
            });

            this._send(payload);
        });
    }

    // --- Helper Methods ---

    /**
     * Show all available commands.
     * @returns {Promise<string>}
     */
    async getCommands() {
        return this.sendCommand('commands');
    }

    /**
     * Get the current BE Server version.
     * @returns {Promise<string>}
     */
    async getVersion() {
        return this.sendCommand('version');
    }

    /**
     * Get information about all players on the server.
     * @returns {Promise<string>}
     */
    async getPlayers() {
        return this.sendCommand('players');
    }

    /**
     * Get a list of all BE server bans.
     * @returns {Promise<string>}
     */
    async getBans() {
        return this.sendCommand('bans');
    }

    /**
     * List all RCon clients/admins currently connected.
     * @returns {Promise<string>}
     */
    async getAdmins() {
        return this.sendCommand('admins');
    }

    /**
     * Kick a player from the server.
     * @param {number|string} playerId The player # to kick.
     * @param {string} [reason=''] Optional reason to show to the player.
     * @returns {Promise<string>}
     */
    async kick(playerId, reason = '') {
        return this.sendCommand(`kick ${playerId} ${reason}`.trim());
    }

    /**
     * Ban a player currently on the server.
     * @param {number|string} playerId The player # to ban.
     * @param {number} [minutes=0] Duration in minutes (0 = permanent).
     * @param {string} [reason=''] Optional reason.
     * @returns {Promise<string>}
     */
    async ban(playerId, minutes = 0, reason = '') {
        return this.sendCommand(`ban ${playerId} ${minutes} ${reason}`.trim());
    }

    /**
     * Ban a player (GUID or IP) not necessarily on the server.
     * @param {string} identifier GUID or IP address.
     * @param {number} [minutes=0] Duration in minutes (0 = permanent).
     * @param {string} [reason=''] Optional reason.
     * @returns {Promise<string>}
     */
    async addBan(identifier, minutes = 0, reason = '') {
        return this.sendCommand(`addBan ${identifier} ${minutes} ${reason}`.trim());
    }

    /**
     * Remove a ban.
     * @param {number|string} banId The ban # to remove (from getBans).
     * @returns {Promise<string>}
     */
    async removeBan(banId) {
        return this.sendCommand(`removeBan ${banId}`);
    }

    /**
     * Re-write the current ban list to bans.txt.
     * @returns {Promise<string>}
     */
    async writeBans() {
        return this.sendCommand('writeBans');
    }

    /**
     * (Re)load the BE ban list from bans.txt.
     * @returns {Promise<string>}
     */
    async loadBans() {
        return this.sendCommand('loadBans');
    }

    /**
     * Send a message to players.
     * @param {string} message The message to send.
     * @param {number|string} [playerId=-1] Player # to send to (-1 = all players).
     * @returns {Promise<string>}
     */
    async say(message, playerId = -1) {
        return this.sendCommand(`say ${playerId} ${message}`);
    }

    _send(payload) {
        const packet = Buffer.alloc(payload.length + 6);
        PACKET_HEAD.copy(packet, 0);
        
        // CRC32 calculation matching original logic
        const checksum = crc32(payload);
        const crcVal = checksum.readInt32LE(0); 
        packet.writeInt32BE(crcVal, 2); 
        
        payload.copy(packet, 6);
        
        this.socket.send(packet, 0, packet.length, this.config.port, this.config.ip);
    }

    _handleMessage(msg, rinfo) {
        if (msg.length < 7) return;
        
        // Check Header 'BE'
        if (msg[0] !== 0x42 || msg[1] !== 0x45) return;

        const packetCrc = msg.readInt32BE(2);
        const payload = msg.slice(6);
        const calcCrc = crc32(payload).readInt32LE(0); 

        if (packetCrc !== calcCrc) return; // CRC Mismatch

        if (payload[0] !== 0xFF) return;
        
        const type = payload[1];
        
        switch (type) {
            case TYPE_LOGIN:
                this._handleLoginResponse(payload);
                break;
            case TYPE_COMMAND:
                this._handleCommandResponse(payload);
                break;
            case TYPE_MESSAGE:
                this._handleServerMessage(payload);
                break;
        }
    }

    _handleLoginResponse(payload) {
        const success = payload[2] === 0x01;
        this.emit('loginResponse', success);
    }

    _handleCommandResponse(payload) {
        // 0xFF 0x01 [Sequence] [Data...]
        const seq = payload[2];
        const data = payload.slice(3);

        // Check for Multipart: 0xFF 0x01 [Sequence] 0x00 [Total] [Index] [Data...]
        if (data.length > 1 && data[0] === 0x00) {
            const total = data[1];
            const index = data[2];
            const chunk = data.slice(3);
            
            if (this.pendingCommands.has(seq)) {
                const cmd = this.pendingCommands.get(seq);
                
                // Initialize multipart array if needed
                if (cmd.multipart.length === 0) {
                    cmd.multipart = new Array(total);
                }
                
                cmd.multipart[index] = chunk;
                
                // Check if we have all parts
                let complete = true;
                for (let i = 0; i < total; i++) {
                    if (!cmd.multipart[i]) {
                        complete = false;
                        break;
                    }
                }

                if (complete) {
                    const fullBuffer = Buffer.concat(cmd.multipart);
                    clearTimeout(cmd.timer);
                    this.pendingCommands.delete(seq);
                    cmd.resolve(fullBuffer.toString('utf8'));
                }
            }
        } else {
            // Single packet
            // If length is 3 (header only), it might be Keepalive ACK or empty response.
            // We only resolve if we have a pending command.
            if (this.pendingCommands.has(seq)) {
                const cmd = this.pendingCommands.get(seq);
                
                // If data is empty (just sequence), resolve with empty string?
                // Or if it's keepalive (which we don't track specifically), ignore?
                // But if user sent a command and got empty response, we should resolve.
                // Keepalives use their own sequence number usually.
                
                clearTimeout(cmd.timer);
                this.pendingCommands.delete(seq);
                cmd.resolve(data.toString('utf8'));
            }
        }
    }

    _handleServerMessage(payload) {
        const seq = payload[2];
        const msg = payload.slice(3).toString('utf8');

        // ACK
        const ackPayload = Buffer.alloc(3);
        ackPayload.writeUInt8(0xFF, 0);
        ackPayload.writeUInt8(TYPE_MESSAGE, 1);
        ackPayload.writeUInt8(seq, 2);
        
        this._send(ackPayload);
        
        this.emit('message', msg);
    }

    _nextSequence() {
        const s = this.sequence;
        this.sequence = (this.sequence + 1) % 256;
        return s;
    }

    _startKeepAlive() {
        this._stopKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            const seq = this._nextSequence();
            const payload = Buffer.alloc(3);
            payload.writeUInt8(0xFF, 0);
            payload.writeUInt8(TYPE_COMMAND, 1);
            payload.writeUInt8(seq, 2);
            
            this._send(payload);
        }, this.config.keepAliveInterval);
    }

    _stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }
}

module.exports = BattleNode;
