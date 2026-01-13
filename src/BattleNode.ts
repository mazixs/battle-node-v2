import { EventEmitter } from 'events';
import { ITransport, TransportConfig } from './transport/ITransport.js';
import { UdpTransport } from './transport/UdpTransport.js';
import { TcpTransport } from './transport/TcpTransport.js';
import { PacketBuilder } from './protocol/PacketBuilder.js';
import { PacketParser, PacketParseResult } from './protocol/PacketParser.js';
import { PacketType, DEFAULTS } from './protocol/Constants.js';
import { PacketAssembler } from './protocol/PacketAssembler.js';
import { RconError, RconErrorCode } from './RconError.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, message: string, meta?: unknown) => void;

export interface RconStats {
    commandsSent: number;
    commandsFailed: number;
    packetsLost: number;
    averageLatency: number;
    uptime: number;
    isConnected: boolean;
}

export interface BattleNodeConfig extends TransportConfig {
    readonly rconPassword?: string;
    readonly transportType?: 'udp' | 'tcp';
    readonly keepAliveInterval?: number;
    readonly commandTimeout?: number;
    readonly maxRetries?: number;
    readonly retryDelay?: number;
    readonly logger?: Logger;
    readonly logLevel?: LogLevel;
}

export declare interface BattleNode {
    on(event: 'message', listener: (message: string) => void): this;
    on(event: 'connected', listener: () => void): this;
    on(event: 'disconnected', listener: () => void): this;
    on(event: 'reconnecting', listener: () => void): this; // Placeholder for future auto-reconnect logic
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'loginResponse', listener: (success: boolean) => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string | symbol, listener: (...args: any[]) => void): this;
}

interface PendingCommand {
    readonly resolve: (response: string) => void;
    readonly reject: (error: Error) => void;
    readonly sentAt: number;
    readonly command: string;
    readonly timer: NodeJS.Timeout; // Ensure timer is explicitly typed here
    // Multipart handling is now delegated to PacketAssembler
}

export class BattleNode extends EventEmitter {
    private readonly transport: ITransport;
    private readonly config: Required<Omit<BattleNodeConfig, 'logger' | 'logLevel'>> & { logger?: Logger; logLevel: LogLevel };
    
    private sequence = 0;
    private readonly pendingCommands = new Map<number, PendingCommand>();
    private keepAliveTimer: NodeJS.Timeout | null = null;
    private connected = false;
    private loginPromise: { resolve: () => void; reject: (err: Error) => void } | null = null;
    private startTime: number = 0;

    // Components
    private readonly packetAssembler: PacketAssembler;
    private readonly commandQueue: Array<() => Promise<void>> = [];
    private isProcessingQueue = false;

    // Stats
    private readonly stats: RconStats = {
        commandsSent: 0,
        commandsFailed: 0,
        packetsLost: 0,
        averageLatency: 0,
        uptime: 0,
        isConnected: false
    };

    constructor(config: BattleNodeConfig) {
        super();
        this.config = {
            ip: config.ip,
            port: config.port,
            rconPassword: config.rconPassword ?? '',
            timeout: config.timeout ?? DEFAULTS.TIMEOUT,
            transportType: config.transportType ?? 'udp',
            keepAliveInterval: config.keepAliveInterval ?? DEFAULTS.KEEPALIVE_INTERVAL,
            commandTimeout: config.commandTimeout ?? 5000,
            maxRetries: config.maxRetries ?? 3,
            retryDelay: config.retryDelay ?? 1000,
            logLevel: config.logLevel ?? 'info',
            ...(config.logger ? { logger: config.logger } : {})
        };

        this.packetAssembler = new PacketAssembler(this.config.commandTimeout);

        if (this.config.transportType === 'tcp') {
            this.transport = new TcpTransport(this.config);
        } else {
            this.transport = new UdpTransport(this.config);
        }

        this.setupTransport();
    }

    private setupTransport(): void {
        this.transport.on('message', (msg: Buffer) => this.handleMessage(msg));
        this.transport.on('error', (err: Error) => {
            this.log('error', 'Transport error', { error: err.message });
            this.emit('error', new RconError(err.message, RconErrorCode.SOCKET_ERROR));
        });
        this.transport.on('close', () => {
            if (this.connected) {
                this.log('warn', 'Connection closed unexpectedly');
                this.disconnect();
            }
        });
        this.transport.on('connected', () => {
            this.log('debug', 'Transport connected');
        });
    }

    private log(level: LogLevel, message: string, meta?: unknown): void {
        if (!this.config.logger) return;
        
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        if (levels.indexOf(level) >= levels.indexOf(this.config.logLevel)) {
            this.config.logger(level, message, meta);
        }
    }

    public getStats(): RconStats {
        return {
            ...this.stats,
            uptime: this.connected ? Date.now() - this.startTime : 0,
            isConnected: this.connected
        };
    }

    public async login(): Promise<void> {
        if (this.connected) return;

        this.log('info', `Connecting to ${this.config.ip}:${this.config.port}...`);
        await this.transport.connect();

        return new Promise<void>((resolve, reject) => {
            this.loginPromise = { resolve, reject };

            const packet = PacketBuilder.buildLogin(this.config.rconPassword);
            
            this.transport.send(packet).catch((err: Error) => {
                this.loginPromise = null;
                reject(new RconError(err.message, RconErrorCode.SOCKET_ERROR));
            });

            // Login timeout
            setTimeout(() => {
                if (this.loginPromise) {
                    this.loginPromise.reject(new RconError('Login timeout', RconErrorCode.AUTHENTICATION_FAILED));
                    this.loginPromise = null;
                }
            }, this.config.timeout);
        });
    }

    public async sendCommand(command: string): Promise<string> {
        if (!this.connected) throw new RconError('Not connected', RconErrorCode.DISCONNECTED);

        // Queue implementation for sequential execution
        return new Promise<string>((resolve, reject) => {
            const task = async () => {
                try {
                    const result = await this.executeCommandWithRetry(command);
                    resolve(result);
                } catch (err) {
                    // Safe cast to Error
                    if (err instanceof Error) reject(err);
                    else reject(new Error(String(err)));
                }
            };

            this.commandQueue.push(task);
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.commandQueue.length > 0) {
            const task = this.commandQueue.shift();
            if (task) {
                try {
                    await task();
                } catch (err) {
                    this.log('error', 'Queue processing error', err);
                }
            }
        }

        this.isProcessingQueue = false;
    }

    private async executeCommandWithRetry(command: string): Promise<string> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                    this.log('debug', `Retrying command '${command}' (Attempt ${attempt + 1}/${this.config.maxRetries + 1}) in ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                return await this.sendSingleCommand(command);
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                
                // Don't retry on certain errors (e.g. invalid response format, or strict socket errors?)
                // For now, retry on timeouts and packet loss.
                this.stats.commandsFailed++;
            }
        }

        throw lastError ?? new RconError('Command failed after retries', RconErrorCode.COMMAND_TIMEOUT);
    }

    private sendSingleCommand(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const seq = this.nextSequence();
            const packet = PacketBuilder.buildCommand(seq, command);
            
            const sentAt = Date.now();
            this.stats.commandsSent++;

            const timer = setTimeout(() => {
                if (this.pendingCommands.has(seq)) {
                    this.pendingCommands.delete(seq);
                    this.stats.packetsLost++;
                    reject(new RconError(`Command timed out`, RconErrorCode.COMMAND_TIMEOUT));
                }
            }, this.config.commandTimeout);

            this.pendingCommands.set(seq, {
                resolve,
                reject,
                sentAt,
                command,
                timer
            });

            this.transport.send(packet).catch((err: Error) => {
                clearTimeout(timer);
                this.pendingCommands.delete(seq);
                reject(new RconError(err.message, RconErrorCode.SOCKET_ERROR));
            });
        });
    }

    public disconnect(): void {
        this.log('info', 'Disconnecting...');
        
        // 1. Stop timers
        this.stopKeepAlive();
        
        // 2. Clear pending commands
        for (const [seq, cmd] of this.pendingCommands) {
            clearTimeout(cmd.timer);
            cmd.reject(new RconError('Client disconnected', RconErrorCode.DISCONNECTED));
        }
        this.pendingCommands.clear();
        this.packetAssembler.clear();

        // 3. Close transport
        this.transport.close();
        
        // 4. Reset state
        this.connected = false;
        this.startTime = 0;
        this.stats.isConnected = false;
        
        this.emit('disconnected');
    }

    private handleMessage(buffer: Buffer): void {
        this.log('debug', `Received packet (${buffer.length} bytes)`, { hex: buffer.toString('hex') });
        const result: PacketParseResult = PacketParser.parse(buffer);
        if (!result.isValid) {
            this.log('warn', 'Invalid packet received', result.error);
            return;
        }
        this.log('debug', `Packet parsed successfully, type: ${result.type}`);

        switch (result.type) {
            case PacketType.Login:
                this.handleLoginResponse(result.body);
                break;
            case PacketType.Command:
                this.handleCommandResponse(result.body);
                break;
            case PacketType.Message:
                this.handleServerMessage(result.body);
                break;
        }
    }

    private handleLoginResponse(body: Buffer): void {
        const firstByte = body[0];
        const success = body.length > 0 && firstByte === 0x01;
        
        if (this.loginPromise) {
            if (success) {
                this.connected = true;
                this.stats.isConnected = true;
                this.startTime = Date.now();
                this.startKeepAlive();
                this.emit('connected');
                this.loginPromise.resolve();
            } else {
                this.loginPromise.reject(new RconError('Invalid RCON password', RconErrorCode.AUTHENTICATION_FAILED));
            }
            this.loginPromise = null;
        }
        
        this.emit('loginResponse', success);
    }

    private handleCommandResponse(body: Buffer): void {
        if (body.length < 1) return;

        const seq = body[0];
        if (seq === undefined) return;

        // Check if we are waiting for this sequence
        if (!this.pendingCommands.has(seq)) {
            // Might be a keepalive response or unrelated
            return;
        }

        const cmd = this.pendingCommands.get(seq);
        if (!cmd) return;

        let payload: Buffer = body;
        let isComplete = true;

        // Delegate to PacketAssembler for Multipart
        if (PacketParser.isMultipart(body)) {
            const assembled = this.packetAssembler.handlePart(body);
            if (assembled) {
                payload = assembled;
                isComplete = true;
            } else {
                isComplete = false;
            }
        } else {
            // Single packet, strip sequence
            payload = body.subarray(1);
        }

        if (isComplete) {
            // Calculate latency
            const latency = Date.now() - cmd.sentAt;
            this.updateLatencyStats(latency);
            
            this.pendingCommands.delete(seq);
            clearTimeout(cmd.timer); 
            
            cmd.resolve(payload.toString('utf8'));
        }
    }

    private updateLatencyStats(latency: number): void {
        // Simple moving average
        if (this.stats.averageLatency === 0) {
            this.stats.averageLatency = latency;
        } else {
            this.stats.averageLatency = Math.floor(this.stats.averageLatency * 0.9 + latency * 0.1);
        }
    }

    private handleServerMessage(body: Buffer): void {
        if (body.length < 1) return;
        const seq = body[0];
        if (seq === undefined) return;

        const msg = body.subarray(1).toString('utf8');

        // Send ACK
        const ack = PacketBuilder.buildAcknowledge(seq);
        this.transport.send(ack).catch((err: Error) => {
            this.log('error', 'Failed to send ACK', err);
        });

        this.emit('message', msg);
    }

    private nextSequence(): number {
        const s = this.sequence;
        this.sequence = (this.sequence + 1) % 256;
        return s;
    }

    private startKeepAlive(): void {
        this.stopKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            if (!this.connected) return;
            const seq = this.nextSequence();
            // KeepAlive is strictly a command packet. 
            // We usually don't need to track response for keepalive, 
            // but strictly speaking BattlEye replies to it. 
            // For simplicity, we fire and forget, or we could track it to measure latency/connection health.
            // For now: Fire and forget to avoid clogging queue.
            const packet = PacketBuilder.buildKeepAlive(seq);
            this.transport.send(packet).catch(() => {}); 
        }, this.config.keepAliveInterval);
    }

    private stopKeepAlive(): void {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    // --- Typed Helper Methods ---
    public async getCommands(): Promise<string> { return this.sendCommand('commands'); }
    public async getVersion(): Promise<string> { return this.sendCommand('version'); }
    public async getPlayers(): Promise<string> { return this.sendCommand('players'); }
    public async getBans(): Promise<string> { return this.sendCommand('bans'); }
    public async getAdmins(): Promise<string> { return this.sendCommand('admins'); }
    public async kick(playerId: number | string, reason = ''): Promise<string> { return this.sendCommand(`kick ${playerId} ${reason}`.trim()); }
    public async ban(playerId: number | string, minutes = 0, reason = ''): Promise<string> { return this.sendCommand(`ban ${playerId} ${minutes} ${reason}`.trim()); }
    public async addBan(identifier: string, minutes = 0, reason = ''): Promise<string> { return this.sendCommand(`addBan ${identifier} ${minutes} ${reason}`.trim()); }
    public async removeBan(banId: number | string): Promise<string> { return this.sendCommand(`removeBan ${banId}`); }
    public async writeBans(): Promise<string> { return this.sendCommand('writeBans'); }
    public async loadBans(): Promise<string> { return this.sendCommand('loadBans'); }
    public async say(message: string, playerId: number | string = -1): Promise<string> { return this.sendCommand(`say ${playerId} ${message}`); }
}
