# Project Knowledge — WebSocket Server

> **This is a living document.** Update this document whenever a module is added, an interface is changed, or system constraints are updated.
> Last updated: 2026-07-31

---

## What This Project Is

A **raw WebSocket server built from scratch in Node.js** using only the standard library (`http`, `net`, `crypto`). No `ws` npm library. No frameworks. The goal is a fully RFC 6455-compliant WebSocket server that is well-structured, testable, and extensible.

The accompanying client is a plain HTML/CSS/JS interface that uses the browser's native `WebSocket` API.

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
| Echo response (preserves incoming opcode) | `server/app.js` | Uses `_messageOpcode` |
| Ping/Pong heartbeat | `server/app.js` | `startHeartbeat()` / `stopHeartbeat()` — 30s interval |
| Close frame sending | `server/app.js` | `_sendClose(code, reason)` |
| Close frame receiving + parsing | `server/app.js` | `_getCloseInfo()` |
| Process fatal error handling | `server/app.js` | `FATAL_ERRORS` (`uncaughtException`, `unhandledRejection`) |
| Graceful shutdown (SIGTERM / SIGINT) | `server/app.js` | `SHUTDOWN_SIGNALS` — sends RFC 6455 close code `1001` (Going Away) to active sockets, closes HTTP server |
| Origin whitelist | `server/config/constants.js` | `ALLOWED_ORIGINS` array |
| Structured logger | `server/logger/Logger.js` | 4-level API: `debug`, `info`, `warn`, `error` |
| Connection registry (singleton) | `server/connections/ConnectionsRegistry.js` | Tracks all active sockets by ID (`conn_N`) |
| Room management | `server/rooms/RoomManager.js` | join, leave, leaveAll, broadcast — exported as singleton |
| JSON message routing | `server/handlers/MessageRouter.js` | Routes `join`, `leave`, `message`, `direct`, `typing`, `ttt_create`, `ttt_join`, `ttt_move`, `ttt_list`, `ttt_leave` actions |
| `sendFrame()` helper function | `server/app.js` | Builds RFC 6455 frames, shared across RoomManager broadcasts |
| Rooms wired into connection lifecycle | `server/app.js` | `leaveAll()` on socket `close`, `user_left` broadcast to remaining members |
| Unit tests (utilities) | `server/tests/unit.test.js` | Utility tests passing |
| Integration tests (handshake) | `server/tests/integration.test.js` | Handshake integration tests passing |
| Logger tests | `server/tests/logger.test.js` | Logger tests passing |
| Room & connection tests | `server/tests/rooms.test.js` | Room manager and connection registry tests passing |
| Tic-Tac-Toe Game Engine | `server/games/TicTacToeGame.js` | Pure rules state machine for Tic-Tac-Toe |
| Tic-Tac-Toe Match Manager | `server/games/GameManager.js` | Match roster orchestration, X/O slots, spectators, room binding |
| Tic-Tac-Toe unit tests | `server/tests/tictactoe-game.test.js` | Unit tests for game rules and win detection passing |
| GameManager unit tests | `server/tests/game-manager.test.js` | Unit tests for match creation, slots, move permissions passing |
| Git hooks tests | `server/tests/githooks.test.js` | Git hooks tests passing |
| Git hooks (pre-commit, commit-msg, pre-push) | `.githooks/` | Enforced via `git config core.hooksPath .githooks` |
| Auto-activate hooks on `npm install` | `package.json` | `"prepare": "git config core.hooksPath .githooks"` |
| Client HTML UI | `template.html`, `client.js`, `client.css` | Interactive client with Echo Mode, Rooms Mode, Direct Messaging, and Multiplayer Tic-Tac-Toe |

---

## Module Interfaces

### `utilities/utilities.js`

```js
isOriginAllowed(origin: string): boolean
check(socket, upgradeCheck, connectionCheck, methodCheck, originCheck): boolean | undefined
createUpgradeHeaders(clientKey: string): string
generateServerKey(clientKey: string): string
_unmaskPayload(payloadBuffer: Buffer, maskKey: Buffer): Buffer
```

### `config/constants.js`

```js
PORT: 4000
LOG_LEVEL: 'INFO'
FATAL_ERRORS: string[]          // ['uncaughtException', 'unhandledRejection']
SHUTDOWN_SIGNALS: string[]      // ['SIGINT', 'SIGTERM']
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

### `logger/Logger.js`

```js
Logger.debug(message: string, context?: object): void
Logger.info(message: string, context?: object): void
Logger.warn(message: string, context?: object): void
Logger.error(message: string, context?: object): void

// Output format: [LEVEL] [TIMESTAMP] message — {context_json}
```

### `connections/ConnectionsRegistry.js` (Singleton Export)

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

### `rooms/RoomManager.js` (Singleton Export)

```js
// Exported as singleton: module.exports = new RoomManager(connectionRegistry)

join(roomName: string, connectionId: string): number
leave(roomName: string, connectionId: string): number
leaveAll(connectionId: string): string[]
getRooms(connectionId: string): string[]
getMembers(roomName: string): string[]
getMemberCount(roomName: string): number
broadcast(roomName: string, message: string, senderConnectionId: string, sendFrameFn: Function): number
```

### `handlers/MessageRouter.js` (Class Export)

```js
// Exported as class: module.exports = MessageRouter

handleMessage(connectionId: string, payloadString: string): void
// Dispatches to internal handlers for room actions, direct messages, or non-JSON echo.
```

---

## Application Protocol

The messaging system uses a JSON-based protocol over WebSocket text frames.

### Client → Server Messages

```json
{ "action": "join",            "room": "general" }
{ "action": "leave",           "room": "general" }
{ "action": "message",         "room": "general", "text": "Hello!" }
{ "action": "direct_message",  "targetId": "conn_2", "text": "Private message" }
{ "action": "list_rooms" }
```

### Server → Client Messages

```json
{ "action": "welcome",        "connectionId": "conn_1" }
{ "action": "joined",         "room": "general", "members": 5 }
{ "action": "left",           "room": "general" }
{ "action": "message",        "room": "general", "from": "conn_1", "text": "Hello!" }
{ "action": "direct_message", "from": "conn_1", "text": "Private message" }
{ "action": "user_joined",    "room": "general", "userId": "conn_2", "members": 6 }
{ "action": "user_left",      "room": "general", "userId": "conn_2", "members": 5 }
{ "action": "room_list",      "rooms": ["general", "vip"] }
{ "action": "error",          "message": "Error details" }
```

### Non-JSON Fallback

If a client sends a message that is not valid JSON, `MessageRouter` echoes it back to the sender as-is.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `WebSocketReceiver` uses callbacks | Direct callback flow is clear and trace-friendly. |
| `Logger` takes 2 args (message + context) | Avoids boilerplate module name parameters while capturing structured context. |
| `ConnectionsRegistry` exported as singleton | Global registry for tracking active socket connections. |
| `RoomManager` exported as singleton | Global room state management for room membership and broadcasting. |
| Non-JSON strings echo back as-is | Preserves backward compatibility with plain text WebSocket clients. |
| Graceful shutdown sends close code 1001/1011 | RFC 6455 code 1001 (Going Away) for OS process signals; code 1011 (Internal Error) for fatal runtime errors. |
| Node built-in test runner | Zero external test runner dependencies. Uses `node:test`. |

---

## Environment & Commands

```bash
# Run the server
npm start                # or: node server/app.js

# Run dev mode (auto-restart on file changes)
npm run dev              # or: node --watch server/app.js

# Start the client UI
npm run client           # or: npx http-server -p 8000

# Run all tests
npm test                 # or: node --test server/tests/*.test.js
```

---

## Git Workflow & Hooks

Three Git hooks are active and enforced via `.githooks/`:

| Hook | Function |
|------|----------|
| `pre-commit` | Runs `npm test` before every commit. Blocks if tests fail. |
| `commit-msg` | Validates Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.). |
| `pre-push` | Blocks direct pushes to `main`. Runs test suite prior to pushing. |

To manually activate hooks:
```bash
git config core.hooksPath .githooks
```

---

## Changelog Summary

| Date | Changes |
|---|---|
| 2026-07-24 | Initial project structure and RFC 6455 frame parsing established. |
| 2026-07-27 | Git hooks configured. Rooms feature added (`ConnectionsRegistry`, `RoomManager`, `MessageRouter`). |
| 2026-07-28 | Auto-activation `"prepare"` script added to `package.json`. |
| 2026-07-29 | Direct messaging support added. LAN origin access configured in `constants.js`. Client UI redesigned. |
| 2026-07-31 | Shutdown refactored: separated `SHUTDOWN_SIGNALS` from `FATAL_ERRORS`. Added unified `gracefulShutdown` with RFC close codes `1001` and `1011`. |
