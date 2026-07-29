# Project Knowledge — WebSocket Server

> **This is a living document.** Every agent that adds a module, changes an interface, or discovers a constraint MUST update the relevant section before ending their session.
> Last updated: 2026-07-29

---

## What This Project Is

A **raw WebSocket server built from scratch in Node.js** using only the standard library (`http`, `net`, `crypto`). No `ws` npm library. No frameworks. The goal is a fully RFC 6455-compliant WebSocket server that is well-structured, testable, and extensible.

The accompanying client is a plain HTML/CSS/JS page that uses the browser's native `WebSocket` API.

---

## Current Project State

### ✅ What Is Done

| Feature | File | Notes |
|---|---|---|
| HTTP server creation | `server/app.js` | Uses `http.createServer()` |
| WebSocket upgrade handshake validation | `server/utilities/utilities.js` | Origin, method, header checks |
| SHA-1 key generation (`Sec-WebSocket-Accept`) | `server/utilities/utilities.js` | `generateServerKey()` — RFC 6455 §1.3 compliant, test-verified |
| Frame parsing (info, length, mask, payload) | `server/app.js` (`WebSocketReceiver` class) | State machine with `do/while` loop |
| Frame fragmentation / reassembly | `server/app.js` | `_fragments` array, FIN bit detection |
| Payload unmasking | `server/utilities/utilities.js` | `_unmaskPayload()` |
| Echo response (preserves incoming opcode) | `server/app.js` | Bug fix applied — now uses `_messageOpcode` |
| Ping/Pong heartbeat | `server/app.js` | `startHeartbeat()` / `stopHeartbeat()` — 30s interval |
| Close frame sending | `server/app.js` | `_sendClose(code, reason)` |
| Close frame receiving + parsing | `server/app.js` | `_getCloseInfo()` |
| Process error handling | `server/app.js` | `uncaughtException`, `unhandledRejection` |
| Graceful shutdown (SIGTERM / SIGINT) | `server/app.js` | Sends RFC 6455 close code `1012` to all active sockets, then closes server |
| Origin whitelist | `server/config/constants.js` | `ALLOWED_ORIGINS` array |
| Structured logger | `server/logger/Logger.js` | 4-level API: `debug`, `info`, `warn`, `error` |
| Connection registry (singleton) | `server/connections/ConnectionsRegistry.js` | Tracks all active sockets by ID |
| Room management | `server/rooms/RoomManager.js` | join, leave, leaveAll, broadcast — exported as singleton |
| JSON message routing | `server/handlers/MessageRouter.js` | Routes `join`, `leave`, `message`, `list_rooms` actions |
| `sendFrame()` standalone function | `server/app.js` | Builds RFC 6455 frames, shared across RoomManager broadcasts |
| Rooms wired into connection lifecycle | `server/app.js` | `leaveAll()` on socket `close`, `user_left` broadcast to remaining members |
| Unit tests (utilities) | `server/tests/unit.test.js` | 4 tests — all passing |
| Integration tests (handshake) | `server/tests/integration.test.js` | 3 tests — all passing |
| Logger tests | `server/tests/logger.test.js` | 12 tests — all passing |
| Room & connection tests | `server/tests/rooms.test.js` | 3 tests — all passing |
| Git hooks tests | `server/tests/githooks.test.js` | 27 tests — all passing |
| Git hooks (pre-commit, commit-msg, pre-push) | `.githooks/` | Enforced via `git config core.hooksPath .githooks` |
| Auto-activate hooks on `npm install` | `package.json` | `"prepare": "git config core.hooksPath .githooks"` |
| Client HTML UI | `template.html` | Echo demo with send/receive/close |

**Total tests: 49 (all passing)**

### ⚠️ Known Bugs (Not Yet Fixed)

None outstanding. All bugs from the original review (Items I, J, K, L, M) have been fixed.

### 🔲 Planned Restructuring (Approved, Not Yet Started)

The `WebSocketReceiver` class and all supporting code in `app.js` needs to be extracted into the module structure defined in `AGENTS.md` Section 1.

Order of work agreed with user:
1. Extract `WebSocketReceiver` → `server/websocket/WebSocketReceiver.js` (callbacks-based, no EventEmitter)
2. Extract send logic → `server/websocket/WebSocketSender.js`
3. Create `WebSocketConnection.js` to wire them together
4. Create `HttpServer.js` and `ConnectionManager.js`
5. Slim down `app.js` to entry point only
6. Create `Handler.js` + `EchoHandler.js`
7. Write new tests for extracted modules

> **Note:** The Rooms feature (Items N–R from `implementation_plan.md`) is already **fully implemented** as a layer on top of the still-monolithic `app.js`. During the refactor above, the `ConnectionRegistry`, `RoomManager`, and `MessageRouter` must continue to function — do not remove or restructure their singleton exports without updating all consumers.

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
VERSION: 13
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

### `logger/Logger.js` — Current (stable)

```js
// Simple 2-argument API — no module name needed
Logger.debug(message: string, context?: object): void
Logger.info(message: string, context?: object): void
Logger.warn(message: string, context?: object): void
Logger.error(message: string, context?: object): void

// Output format:
// [LEVEL] [TIMESTAMP] message — {context_json}
// Example: [INFO] 2026-07-24T10:30:00.000Z New connection established — {"port":51423}
// LOG_LEVEL env var controls minimum level. Default: INFO
```

### `connections/ConnectionRegistry.js` — Current (stable, singleton export)

```js
// Exported as singleton: module.exports = new ConnectionRegistry()
// ID format: conn_<incrementing_number> (e.g. conn_1, conn_2)

generateId(): string                      // returns unique 'conn_N' ID
register(connectionId: string, socket: net.Socket): void
unregister(connectionId: string): void
getSocket(connectionId: string): net.Socket | null
getAllIds(): string[]
getCount(): number
```

### `rooms/RoomManager.js` — Current (stable, singleton export)

```js
// Exported as singleton: module.exports = new RoomManager(connectionRegistry)
// Internally stores Map<string, Set<string>> — roomName → Set of connectionIds

join(roomName: string, connectionId: string): number         // returns new member count
leave(roomName: string, connectionId: string): number        // returns remaining member count; deletes room if empty
leaveAll(connectionId: string): string[]                     // removes connection from all rooms; returns list of room names left
getRooms(connectionId: string): string[]                     // returns all rooms a connection is in
getMembers(roomName: string): string[]                       // returns all connectionIds in a room
getMemberCount(roomName: string): number
broadcast(roomName: string, message: string, senderConnectionId: string, sendFrameFn: Function): number
// ^ broadcasts to all room members EXCEPT senderConnectionId; returns recipient count
```

> **Design note:** `RoomManager` accepts a `sendFrameFn` callback in `broadcast()` rather than importing `sendFrame` directly — this keeps it decoupled from `app.js` and testable with mock sockets.

### `handlers/MessageRouter.js` — Current (stable, class export)

```js
// Exported as class: module.exports = MessageRouter
// Instantiated in app.js: new MessageRouter(roomManager, connectionRegistry, sendFrame)

handleMessage(connectionId: string, payloadString: string): void
// Parses JSON from client. Non-JSON strings are echoed back to sender.
// Dispatches to one of:
//   _handleJoin(connectionId, roomName)
//   _handleLeave(connectionId, roomName)
//   _handleRoomMessage(connectionId, roomName, text)
//   _handleListRooms(connectionId)
//   _sendError(connectionId, message)

// Private helpers:
_sendToSender(connectionId: string, message: string): void
```

### `sendFrame()` — Standalone function in `app.js`

```js
// Defined at the top of app.js; passed into RoomManager.broadcast() and MessageRouter
sendFrame(socket: net.Socket, message: string | Buffer, opcode?: number): void
// opcode defaults to CONSTANTS.OPCODE_TEXT (0x01)
// Handles small (<=125), medium (<=65535), and large (>65535) payload sizes
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
class WebSocketConnection {
    constructor(socket: net.Socket, handler: Handler)
    send(data: Buffer | string): void
    close(code: number, reason: string): void
    get id(): string
    get remotePort(): number
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

---

## Rooms Feature — Application Protocol

The Rooms system uses a JSON-based message protocol on top of WebSocket text frames.

### Client → Server Messages

```json
{ "action": "join",       "room": "general" }
{ "action": "leave",      "room": "general" }
{ "action": "message",    "room": "general", "text": "Hello!" }
{ "action": "list_rooms" }
{ "action": "list-rooms" }
```
> `list_rooms` and `list-rooms` are both accepted (both handled in the switch statement).

### Server → Client Messages

```json
{ "action": "joined",      "room": "general", "members": 5 }
{ "action": "left",        "room": "general" }
{ "action": "message",     "room": "general", "from": "conn_1", "text": "Hello!" }
{ "action": "user_joined", "room": "general", "userId": "conn_2", "members": 6 }
{ "action": "user_left",   "room": "general", "userId": "conn_2", "members": 5 }
{ "action": "room_list",   "rooms": ["general", "vip"] }
{ "action": "error",       "message": "Room name is required" }
```

### Non-JSON fallback

If a client sends a message that is not valid JSON, `MessageRouter` echoes it back to the sender as-is (backward-compatible with plain echo behavior).

---

## Key Design Decisions (with Rationale)

| Decision | Rationale |
|---|---|
| `WebSocketReceiver` uses callbacks, NOT EventEmitter | Simpler and more readable. Callbacks are passed in the constructor — no `.on()`, no `.emit()`, no indirection. |
| `Logger` takes 2 args (message + optional context), NOT a module name | Avoids boilerplate. The timestamp and log level are enough to trace issues. |
| `WebSocketSender` is pure static functions, not a class | Sending frames is stateless — just takes a socket and data and writes. A class would add no value. |
| `Handler` is a base class you extend | JS has no interfaces, but `throw new Error('Not implemented')` enforces the contract clearly without framework overhead. |
| `WebSocketConnection` injects handler via constructor | Keeps the connection layer decoupled from which handler is active — easy to swap. |
| `ConnectionsRegistry` exported as singleton | One global map of all active sockets. Any module that needs to look up a socket by ID imports the same instance. |
| `RoomManager` exported as singleton | One global room state. Avoids passing the instance around — both `app.js` and `MessageRouter` need it. |
| `RoomManager.broadcast()` accepts `sendFrameFn` callback | Decouples RoomManager from the frame-construction logic in `app.js`. Makes broadcast testable with mock sockets. |
| Non-JSON strings echo back as-is | Preserves backward compatibility with any client that sends raw text strings instead of JSON action objects. |
| `sendFrame()` defaults to `OPCODE_TEXT` | Room messages are always JSON strings (text), so the default opcode is text. Binary frames are still supported via the opcode parameter. |
| Graceful shutdown sends close code 1012 | RFC 6455 close code 1012 = "Service Restart". Informs clients why they are being disconnected, allowing them to reconnect. |
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

**`package.json` is configured** with `start`, `dev`, `client`, `test`, and `prepare` scripts.
The `prepare` script (`git config core.hooksPath .githooks`) auto-activates Git hooks on every `npm install`.

---

## File Dependencies Map

```
app.js
  └── config/constants.js
  └── utilities/utilities.js
      └── config/constants.js
  └── logger/Logger.js
  └── connections/ConnectionsRegistry.js
      └── logger/Logger.js
  └── rooms/RoomManager.js
      └── logger/Logger.js
      └── connections/ConnectionsRegistry.js  (default import)
  └── handlers/MessageRouter.js
      └── logger/Logger.js

tests/unit.test.js
  └── utilities/utilities.js
  └── config/constants.js

tests/integration.test.js
  └── utilities/utilities.js
  └── config/constants.js

tests/logger.test.js
  └── logger/Logger.js

tests/rooms.test.js
  └── connections/ConnectionsRegistry.js
  └── rooms/RoomManager.js
  └── handlers/MessageRouter.js

tests/githooks.test.js
  └── (tests .githooks/ shell scripts directly)
```

---

## Constraints & Gotchas

- **No npm packages allowed** without explicit user approval. This is an intentional "build from scratch" learning project.
- **`ALLOWED_ORIGINS` in `constants.js`** must be updated when testing from a new port/origin.
- **The `_consumeHeaders` method** in `WebSocketReceiver` throws if you try to consume more bytes than exist in the first buffer chunk. This is a known limitation — it assumes headers arrive in one chunk, which is true in practice but should be noted.
- **Process error handlers** in `constants.js` include `SIGINT` and `SIGTERM` in `CUSTOM_ERRORS`, but the graceful shutdown handlers registered via `['SIGTERM', 'SIGINT'].forEach(...)` in `app.js` take precedence. The duplicate registration is a minor inconsistency to clean up during the `app.js` refactor.
- **The state machine variables** (`GET_INFO`, `GET_LENGTH`, etc.) are currently module-level constants in `app.js`. They will move into the `WebSocketReceiver` class as private constants.
- **`*.md` is in `.gitignore`** — markdown files (CHANGELOG, docs, notes) are NOT tracked by Git. Only `.agents/` directory markdown files would need to be force-added if tracking is desired.
- **`ConnectionRegistry.js` is a singleton** — importing it in tests modifies shared state. The rooms test file (`rooms.test.js`) registers/unregisters test connections inline and cleans up at the end of each test to avoid state leakage between tests.
- **`RoomManager.js` imports `ConnectionRegistry` as its default `reg`** — if you pass a custom registry in the constructor (e.g., for testing), it overrides the default. The singleton export (`module.exports = new RoomManager(connectionRegistry)`) uses the real registry.
- **`MessageRouter` is NOT a singleton** — it is a class. `app.js` instantiates it once: `const messageRouter = new MessageRouter(roomManager, connectionRegistry, sendFrame)`.

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

**Auto-activation:** `"prepare"` script in `package.json` runs `git config core.hooksPath .githooks` automatically on every `npm install`.

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
| 2026-07-27 | **Rooms feature implemented**: `ConnectionsRegistry.js`, `RoomManager.js`, `MessageRouter.js` created. Integrated into `app.js`. Graceful shutdown (SIGTERM/SIGINT, close code 1012) added. `rooms.test.js` (3 tests) added. |
| 2026-07-28 | Auto-hooks: `"prepare"` script added to `package.json` to auto-activate `.githooks` on `npm install`. |
