# Architecture & Best Practices

## Core Design Principles

### 1. Zero Dependencies
The library relies exclusively on native Node.js APIs (`net`, `dgram`, `events`, `util`, `test`). This ensures:
-   **Security:** Minimized supply chain attack surface.
-   **Stability:** No breaking changes from upstream dependencies.
-   **Performance:** Lightweight footprint without bloat.

### 2. Strict Type Safety
We utilize strict TypeScript configuration (`ES2023`, `NodeNext`) to guarantee type correctness at compile time.
-   `noUncheckedIndexedAccess`: Prevents accessing array/map elements without undefined checks.
-   `exactOptionalPropertyTypes`: Enforces precise property definitions.

### 3. Transport Agnostic Layer
The `BattleNode` class is decoupled from the underlying network protocol via the `ITransport` interface.
-   **UDP (Standard):** Implements BattlEye's connectionless protocol with application-level sequencing and reliability.
-   **TCP (Proxy):** Implements a stream-based transport with a "Sliding Window" `PacketBuffer` for correct frame reassembly.

---

## Internal Mechanisms

### Packet Reassembly (TCP & UDP)
BattlEye packets can be fragmented. We handle this differently per transport:
-   **UDP:** Uses `PacketAssembler` to track multipart headers (`Total`, `Index`) and wait for all parts before emitting. Handles timeouts to prevent memory leaks from incomplete streams.
-   **TCP:** Uses `PacketBuffer` to accumulate raw byte streams. It scans for the `BE` header and verifies the `CRC32` checksum of the potential payload to identify packet boundaries (Framing).

### Command Queue
RCON commands must be executed sequentially to map responses correctly.
-   `BattleNode` implements a FIFO queue (`commandQueue`).
-   Each command waits for the previous one to complete or timeout.
-   **Retry Logic:** Commands are retried with exponential backoff upon failure (timeout or packet loss), configurable via `maxRetries`.

### Scheduler (Native)
A built-in lightweight scheduler allows for automated tasks without external cron libraries.
-   **Anti-Overlap:** Prevents a task from starting if the previous execution is still running (drift over overlap).
-   **Error Isolation:** Task failures are caught and logged; the scheduler keeps running.
-   **Graceful Shutdown:** All timers are cleared instantly upon `disconnect()`.

---

## Best Practices for Developers

### 1. Connection Management
Always handle the `disconnected` event to implement reconnection logic if your application requires 24/7 persistence.

```typescript
client.on('disconnected', () => {
    console.log('Disconnected. Retrying in 30s...');
    setTimeout(() => client.login(), 30000);
});
```

### 2. Error Handling
The library distinguishes between operational errors (timeouts) and critical failures (auth).
-   Catch errors on `login()` for critical startup failures.
-   Catch errors on `sendCommand()` for temporary network glitches.

### 3. Performance
-   Avoid setting `keepAliveInterval` too low (< 5s) to prevent flooding.
-   Use `getStats()` to monitor `averageLatency`. If latency spikes > 500ms, consider pausing heavy data polling (like `players`).

### 4. Scheduler Usage
Use string duration formats (`'30s'`, `'5m'`) for readability.
-   **Heavy Tasks:** Set longer intervals (e.g., `5m` for `writeBans`).
-   **Real-time Tasks:** Use short intervals (e.g., `10s` for `players`) but ensure your callback completes faster than the interval.

