import { EventEmitter } from 'events';

export interface TransportConfig {
    readonly ip: string;
    readonly port: number;
    readonly timeout?: number;
}

export interface ITransport extends EventEmitter {
    /**
     * Connect to the remote server.
     * For UDP, this prepares the socket and sets the default remote address.
     * For TCP, this establishes the handshake.
     */
    connect(): Promise<void>;

    /**
     * Send a raw buffer to the server.
     */
    send(data: Buffer): Promise<void>;

    /**
     * Close the connection.
     */
    close(): void;

    // Strict Event Emitters
    on(event: 'message', listener: (msg: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'connected', listener: () => void): this;
    
    // Allow other events but prefer strict ones above
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string | symbol, listener: (...args: any[]) => void): this;
}
