/**
 * RCON Error Codes
 */
export enum RconErrorCode {
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
    CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
    COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
    PACKET_LOST = 'PACKET_LOST',
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    DISCONNECTED = 'DISCONNECTED',
    SOCKET_ERROR = 'SOCKET_ERROR'
}

/**
 * Custom RCON Error class with error code support.
 */
export class RconError extends Error {
    public readonly code: RconErrorCode;

    constructor(message: string, code: RconErrorCode) {
        super(message);
        this.name = 'RconError';
        this.code = code;
        
        // Restore prototype chain for instanceof checks (TypeScript fix for extending Error)
        Object.setPrototypeOf(this, RconError.prototype);
    }
}
