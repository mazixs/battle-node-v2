import * as net from 'net';
import { EventEmitter } from 'events';
import { ITransport, TransportConfig } from './ITransport.js';

/**
 * TCP Transport implementation.
 * Note: TCP is stream-based. This transport emits chunks as they arrive.
 * Packet assembly/framing must be handled by the Protocol layer.
 */
export class TcpTransport extends EventEmitter implements ITransport {
    private readonly socket: net.Socket;
    private readonly config: TransportConfig;
    private isConnected = false;

    constructor(config: TransportConfig) {
        super();
        this.config = config;
        this.socket = new net.Socket();
        this.setupListeners();
    }

    private setupListeners(): void {
        this.socket.on('data', (data: Buffer) => {
            this.emit('message', data);
        });

        this.socket.on('error', (err: Error) => {
            this.emit('error', err);
        });

        this.socket.on('close', () => {
            this.isConnected = false;
            this.emit('close');
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.emit('connected');
        });
    }

    public async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const errorHandler = (err: Error) => {
                this.socket.removeListener('connect', connectHandler);
                reject(err);
            };

            const connectHandler = () => {
                this.socket.removeListener('error', errorHandler);
                resolve();
            };

            this.socket.once('error', errorHandler);
            this.socket.once('connect', connectHandler);

            this.socket.connect(this.config.port, this.config.ip);
        });
    }

    public async send(data: Buffer): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('Socket not connected'));
            }

            const success = this.socket.write(data, (err?: Error | null) => {
                if (err) {
                    reject(err);
                } else {
                    // If callback is called without error, write is done
                    resolve();
                }
            });

            // If write returned false, we technically should wait for 'drain',
            // but strictly speaking the callback handles the completion anyway in modern Node.
            // However, for strict flow control, we might want to await drain if success is false.
            // For RCON context, blocking until drain is acceptable.
            if (!success) {
               // We could add a drain listener here if we wanted to be super strict about backpressure
            }
        });
    }

    public close(): void {
        if (!this.socket.destroyed) {
            this.socket.destroy();
        }
    }
}
