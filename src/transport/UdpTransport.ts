import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { ITransport, TransportConfig } from './ITransport.js';

export class UdpTransport extends EventEmitter implements ITransport {
    private readonly socket: dgram.Socket;
    private readonly config: TransportConfig;
    private isConnected = false;

    constructor(config: TransportConfig) {
        super();
        this.config = config;
        this.socket = dgram.createSocket('udp4');
        this.setupListeners();
    }

    private setupListeners(): void {
        this.socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
            // Verify source matches configured IP/Port to prevent spoofing
            if (rinfo.address === this.config.ip && rinfo.port === this.config.port) {
                this.emit('message', msg);
            }
        });

        this.socket.on('error', (err: Error) => {
            this.emit('error', err);
        });

        this.socket.on('close', () => {
            this.isConnected = false;
            this.emit('close');
        });
    }

    public async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                // UDP is connectionless, but 'connect' filters packets from other sources
                this.socket.connect(this.config.port, this.config.ip, () => {
                    this.isConnected = true;
                    this.emit('connected');
                    resolve();
                });
                
                // Handle immediate errors during bind/connect
                this.socket.once('error', (err: Error) => {
                    reject(err);
                });
            } catch (error) {
                // Catch synchronous errors (e.g. invalid IP)
                if (error instanceof Error) {
                    reject(error);
                } else {
                    reject(new Error(String(error)));
                }
            }
        });
    }

    public async send(data: Buffer): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('Socket not connected'));
            }

            this.socket.send(data, (err: Error | null) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    public close(): void {
        try {
            // Check if socket is already closed to avoid errors
            // There isn't a clean public property for this in Node dgram types usually,
            // but calling close() on closed socket might throw.
            this.socket.close();
        } catch {
            // Ignore close errors
        }
    }
}
