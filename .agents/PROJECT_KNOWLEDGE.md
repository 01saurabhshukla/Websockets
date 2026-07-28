# Project Knowledge — WebSocket Server

> **This is a living document.** Every agent that adds a module, changes an interface, or discovers a constraint MUST update the relevant section before ending their session.
> Last updated: 2026-07-24

---

## What This Project Is

A **raw WebSocket server built from scratch in Node.js** using only the standard library (`http`, `net`, `crypto`). No `ws` npm library. No frameworks. The goal is a fully RFC 6455-compliant WebSocket server that is well-structured, testable, and extensible.

The accompanying client is a plain HTML/CSS/JS page that uses the browser's native `WebSocket` API.

---

## Current Project State

### ✅ What Is Done

| Feature | File | Notes |
|---|---|---|
| HTTP server creation | `new-server/app.js` | Uses `http.createServer()` |
| WebSocket upgrade handshake validation | `new-server/utilities/utilities.js` | Origin, method, header checks |
| SHA-1 key generation (`Sec-WebSocket-Accept`) | `new-server/utilities/utilities.js` | `generateServerKey()` — RFC 6455 §1.3 compliant, test-verified |
| Frame parsing (info, length, mask, payload) | `new-server/app.js` (`WebSocketReceiver` class) | State machine with `do/while` loop |
| Frame fragmentation / reassembly | `new-server/app.js` | `_fragments` array, FIN bit detection |
| Payload unmasking | `new-server/utilities/utilities.js` | `_unmaskPayload()` |
| Echo response (binary frames) | `new-server/app.js` | `_sendEcho()` — always sends `OPCODE_BINARY` |
| Close frame sending | `new-server/app.js` | `_sendClose(code, reason)` |
| Close frame receiving + parsing | `new-server/app.js` | `_getCloseInfo()` |
| Process error handling | `new-server/app.js` | `uncaughtException`, `unhandledRejection`, `SIGINT`, `SIGTERM` |
| Origin whitelist | `new-server/config/constants.js` | `ALLOWED_ORIGINS` array |
| Unit tests (utilities) | `new-server/tests/unit.test.js` | 4 tests — all passing |
| Integration tests (handshake) | `new-server/tests/integration.test.js` | 3 tests — all passing |
| Client HTML UI | `template.html` | Echo demo with send/receive/close |

### ⚠️ Known Bugs (Not Yet Fixed)

| Bug | Location | Severity |
|---|---|---|
| Missing `return` after `_sendClose` in `_getInfo` | `app.js` L140-141 | High — code falls through to `this._task = GET_LENGTH` after close |
| Always sends `OPCODE_BINARY` regardless of input opcode | `app.js` L347 | Medium — text frames echoed as binary |
| Ping frames rejected with close (violates RFC 6455 §5.5.2) | `app.js` L144-147 | Medium — should respond with pong |
| CSS typo: `font-size: 0,9em` | `styles.css` L91 | Low — comma instead of period |
| `populate_btn` event listener added inside `onopen` | `template.html` L64-66 | Low — accumulates listeners on reconnect |
| `form` submit listener added inside `open_ws_btn` click | `template.html` L152 | Low — accumulates duplicate handlers |

### 🔲 Planned Restructuring (Approved, Not Yet Started)

The `WebSocketReceiver` class and all supporting code in `app.js` needs to be extracted into the module structure defined in `AGENTS.md` Section 1. See the full restructuring plan in the artifact `implementation_plan.md`.

Order of work agreed with user:
1. Extract `WebSocketReceiver` → `new-server/websocket/WebSocketReceiver.js` (make it extend `EventEmitter`)
2. Extract send logic → `new-server/websocket/WebSocketSender.js`
3. Create `WebSocketConnection.js` to wire them together
4. Create `Logger.js`
5. Create `HttpServer.js` and `ConnectionManager.js`
6. Slim down `app.js` to entry point only
7. Add `Handler.js` + `EchoHandler.js`
8. Write new tests for extracted modules
9. Fix known bugs (listed above)
10. Add features (ping/pong, text frame preservation, etc.)

---

## Module Interfaces

> Update this section every time you create or change a module's public API.

### `utilities/utilities.js` — Current (stable)

```js
isOriginAllowed(origin: string): boolean
check(socket, upgradeCheck, connectionCheck, methodCheck, originCheck): boolean | undefined
createUpgradeHeaders(clientKey: string): string
generateServerKey(clientKey: string): string
_unmaskPayload(payloadBuffer: Buffer, maskKey: Buffer): Buffer
```

### `config/constants.js` — Current (stable)

```js
PORT: 4000
CUSTOM_ERRORS: string[]
METHOD: 'GET'
CONNECTION: 'upgrade'
UPGRADE: 'websocket'
ALLOWED_ORIGINS: string[]
GUID: string
MIN_FRAME_SIZE: 2
MASK_LENGTH: 4
SMALL_DATA_SIZE: 125
MEDIUM_DATA_SIZE: 65535
MEDIUM_DATA_FLAG: 126
LARGE_DATA_FLAG: 127
MEDIUM_SIZE_CONSUMPTION: 2
LARGE_SIZE_CONSUMPTION: 8
OPCODE_TEXT: 0x01
OPCODE_BINARY: 0x02
OPCODE_CLOSE: 0x08
OPCODE_PING: 0x09
OPCODE_PONG: 0x0A
```

### `websocket/WebSocketReceiver.js` — PLANNED (not yet created)

```js
// Callbacks are passed in the constructor — no EventEmitter, no .emit()
class WebSocketReceiver {
    constructor(socket, callbacks) // callbacks: { onMessage, onClose, onError }
    processBuffer(chunk: Buffer): void

    // Internally calls:
    // callbacks.onMessage(payload: Buffer, opcode: number)
    // callbacks.onClose(code: number, reason: string)
    // callbacks.onError(code: number, reason: string)
}
```

### `websocket/WebSocketSender.js` — PLANNED (not yet created)

```js
// Pure static functions, no instantiation needed
sendMessage(socket: net.Socket, payload: Buffer, opcode: number): void
sendClose(socket: net.Socket, code: number, reason: string): void
sendPong(socket: net.Socket, payload: Buffer): void
```

### `websocket/WebSocketConnection.js` — PLANNED (not yet created)

```js
class WebSocketConnection extends EventEmitter {
    constructor(socket: net.Socket, handler: Handler)
    send(data: Buffer | string): void
    close(code: number, reason: string): void
    get id(): string            // UUID or port-based ID
    get remotePort(): number
}
```

### `server/ConnectionManager.js` — PLANNED (not yet created)

```js
class ConnectionManager {
    addConnection(connection: WebSocketConnection): void
    removeConnection(connection: WebSocketConnection): void
    broadcast(data: Buffer | string): void
    getConnectionCount(): number
    getConnections(): WebSocketConnection[]
}
```

### `server/HttpServer.js` — PLANNED (not yet created)

```js
class HttpServer {
    constructor(connectionManager: ConnectionManager)
    start(port: number): void
    stop(): void
}
```

### `handlers/Handler.js` — PLANNED (not yet created)

```js
class Handler {
    onMessage(connection: WebSocketConnection, message: Buffer): void  // must override
    onClose(connection: WebSocketConnection, code: number, reason: string): void  // optional
    onError(connection: WebSocketConnection, error: Error): void  // optional
}
```

### `logger/Logger.js` — PLANNED (not yet created)

```js
// Simple 2-argument API — no module name needed
Logger.debug(message: string, context?: object): void
Logger.info(message: string, context?: object): void
Logger.warn(message: string, context?: object): void
Logger.error(message: string, context?: object): void

// Output format:
// [LEVEL] [TIMESTAMP] message — {context_json}
// Example: [INFO] 2026-07-24T10:30:00.000Z New connection established — {"port":51423}
```

---

## Key Design Decisions (with Rationale)

| Decision | Rationale |
|---|---|
| `WebSocketReceiver` uses callbacks, NOT EventEmitter | Simpler and more readable. Callbacks are passed in the constructor — no `.on()`, no `.emit()`, no indirection. |
| `Logger` takes 2 args (message + optional context), NOT a module name | Avoids boilerplate. The timestamp and log level are enough to trace issues. |
| `WebSocketSender` is pure static functions, not a class | Sending frames is stateless — just takes a socket and data and writes. A class would add no value. |
| `Handler` is a base class you extend | JS has no interfaces, but `throw new Error('Not implemented')` enforces the contract clearly without framework overhead. |
| `WebSocketConnection` injects handler via constructor | Keeps the connection layer decoupled from which handler is active — easy to swap. |
| Readability over SOLID | SOLID is a guide, not a law. If a pattern makes the code harder to understand, skip it. Single Responsibility is the only non-negotiable rule here. |
| Node built-in test runner, no Jest/Mocha | Zero dependencies for tests. Built-in `node:test` is mature enough for this scope. |

---

## Environment & Running the Project

```bash
# Run the server
npm start                # or: node server/app.js

# Run the server in dev mode (auto-restart on file changes)
npm run dev              # or: node --watch server/app.js

# Start the client (static HTML)
npm run client           # or: npx http-server -p 8000

# Run all tests
npm test                 # or: node --test server/tests/*.test.js

# Run a single test file
node --test server/tests/<filename>.test.js
```

**`package.json` is configured** with `start`, `dev`, `client`, and `test` scripts.

---

## File Dependencies Map

```
app.js
  └── config/constants.js
  └── utilities/utilities.js
      └── config/constants.js

tests/unit.test.js
  └── utilities/utilities.js
  └── config/constants.js

tests/integration.test.js
  └── utilities/utilities.js
  └── config/constants.js
```

---

## Constraints & Gotchas

- **No npm packages allowed** without explicit user approval. This is an intentional "build from scratch" learning project.
- **`ALLOWED_ORIGINS` in `constants.js`** must be updated when testing from a new port/origin.
- **The `_consumeHeaders` method** in `WebSocketReceiver` throws if you try to consume more bytes than exist in the first buffer chunk. This is a known limitation — it assumes headers arrive in one chunk, which is true in practice but should be noted.
- **Process error handlers** use `process.exit(1)` on `SIGINT`/`SIGTERM` — this is intentional but will be improved to graceful shutdown in a future task.
- **The state machine variables** (`GET_INFO`, `GET_LENGTH`, etc.) are currently module-level constants in `app.js`. They will move into the `WebSocketReceiver` class as private constants.
- **`*.md` is in `.gitignore`** — markdown files (CHANGELOG, docs, notes) are NOT tracked by Git. Only `.agents/` directory markdown files would need to be force-added if tracking is desired.

---

## Git Workflow

### Hooks (`.githooks/`)

Three Git hooks are active and enforced. They are stored in `.githooks/` (version-controlled) and activated via:

```bash
git config core.hooksPath .githooks
```

| Hook | What it does |
|------|-------------|
| `pre-commit` | Runs `npm test` before every commit. Blocks if tests fail. |
| `commit-msg` | Validates Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.). Blocks if invalid. |
| `pre-push` | Blocks direct pushes to `main`. Runs tests again before push. |

**Tests for hooks:** `server/tests/githooks.test.js` (27 tests)

### Branching Strategy

- `main` is always stable and deployable
- All work happens on feature branches (e.g., `feature/rooms-and-broadcasting`, `refactor/extract-modules`)
- Merge with `git merge --squash` to keep `main` history clean
- Delete feature branches after merge
- See `AGENTS.md` Section 10 for full details

### Commit Message Convention

Format: `<type>: <description>` (max 72 chars first line)

Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`

Optional scope: `feat(rooms): add join support`

---

## Changelog Summary

See `server/CHANGELOG.md` for detailed per-change records.

| Date | What happened |
|---|---|
| 2026-07-24 | Project reviewed. `AGENTS.md` and `PROJECT_KNOWLEDGE.md` created. Restructuring plan approved. |
| 2026-07-24 | Logger created (Item A), bug fixes (I, J, K, L, M), package.json configured (H). |
| 2026-07-27 | Git hooks added (pre-commit, commit-msg, pre-push). Branching strategy documented in AGENTS.md Section 10. |
