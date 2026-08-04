# Agent Guidelines — WebSocket Server Project

> **MANDATORY**: Every agent working on this project MUST read this file in full before making any changes.
> These guidelines exist to ensure consistency, avoid rework, and preserve the integrity of the codebase across every session.

---

## 0. Before You Do Anything — Read First

Before writing a single line of code, you MUST:

1. Read `PROJECT_KNOWLEDGE.md` (in this same `.agents/` directory) to understand the current state of the project.
2. Read the current `new-server/CHANGELOG.md` to see what has already been done.
3. Scan the existing code structure (run `ls -R new-server/`) to verify no module you plan to create already exists.
4. Check if the feature you are building has a pattern already established — **reuse it**.

Failure to do this is the primary cause of rework. Do not skip this step.

---

## 1. Project Structure — The Single Source of Truth

The canonical project layout is:

```
.githooks/
├── pre-commit                      ← Runs all tests before every commit. Blocks if tests fail.
├── commit-msg                      ← Validates Conventional Commits format. Blocks invalid messages.
└── pre-push                        ← Blocks direct pushes to main. Runs tests before push.

new-server/
├── app.js                          ← Entry point ONLY (~15 lines). Creates server, starts listening.
├── config/
│   └── constants.js                ← All protocol constants. No magic numbers anywhere else.
├── server/
│   ├── HttpServer.js               ← HTTP server creation + 'upgrade' event handler
│   └── ConnectionManager.js        ← Tracks active WebSocketConnections; provides broadcast()
├── websocket/
│   ├── WebSocketReceiver.js        ← Frame parsing state machine. Plain class, uses callbacks.
│   ├── WebSocketSender.js          ← Pure frame construction & socket.write(). No state.
│   └── WebSocketConnection.js      ← Owns socket + receiver + sender. Public API: send(), close()
├── handlers/
│   ├── Handler.js                  ← Base class. All handlers extend this.
│   └── EchoHandler.js              ← Default echo handler (reference implementation).
├── logger/
│   └── Logger.js                   ← Structured logger. See Section 3 for usage rules.
├── utilities/
│   └── utilities.js                ← Handshake utilities (key gen, header construction, unmask).
├── CHANGELOG.md                    ← Append an entry here after every change.
└── tests/
    ├── unit.test.js
    ├── integration.test.js
    ├── githooks.test.js
    ├── receiver.test.js
    └── sender.test.js
```

### Structure Rules

- **`app.js` must stay thin.** It should only: import modules, create the server, call `.listen()`, and register process-level error handlers. Any business logic in `app.js` is a violation.
- **Do NOT add new top-level directories** without updating `PROJECT_KNOWLEDGE.md` and getting it approved.
- **All numeric protocol constants go in `config/constants.js`.** Never hardcode `4`, `126`, `0x08`, etc. inside logic files.
- **Every new module must be placed in the correct layer** (see table below). Do not blur layer boundaries.

| Layer | Responsibility | Must NOT |
|---|---|---|
| `server/` | HTTP lifecycle, upgrade, connection tracking | Know about frame format |
| `websocket/` | RFC 6455 frames (parse, build, send) | Know about application logic |
| `handlers/` | Application-level message logic | Know about frame internals |
| `logger/` | Formatting and emitting log output | Depend on any other layer |
| `utilities/` | Pure crypto/header helpers | Maintain state |
| `config/` | Constants and configuration values | Contain logic |

---

## 2. Reuse First Policy

Before implementing anything, ask: *"Does this already exist?"*

- **Unmask a payload?** → `UTILITIES._unmaskPayload()` in `utilities/utilities.js`
- **Validate an origin?** → `UTILITIES.isOriginAllowed()` in `utilities/utilities.js`
- **Construct upgrade headers?** → `UTILITIES.createUpgradeHeaders()` in `utilities/utilities.js`
- **Build and send a close frame?** → `WebSocketSender.sendClose()`
- **Build and send a data frame?** → `WebSocketSender.sendMessage()`
- **Log something?** → `Logger` (see Section 3). Never use `console.log` directly.
- **Access a protocol constant?** → `require('../config/constants')`. Never redefine a constant.
- **Create a new message handler?** → Extend `Handler` base class from `handlers/Handler.js`.

If you find yourself reimplementing something that already exists, stop and use the existing module.

---

## 3. Logging Standard

**All logging goes through the `Logger` module.** Direct `console.log`, `console.warn`, or `console.error` calls anywhere outside of `logger/Logger.js` are forbidden.

### Logger API

The logger takes just two arguments: a message string and an optional context object.
There is **no module name parameter** — keep it simple.

```js
const Logger = require('../logger/Logger');

Logger.debug('Chunk received', { size: chunk.length });
Logger.info('New connection established', { port: socket.remotePort });
Logger.warn('Payload approaching max size', { current: totalPayloadLength });
Logger.error('Upgrade validation failed', { reason: 'origin not allowed' });
```

### Log Format (enforced by `Logger.js`)

```
[LEVEL] [TIMESTAMP] message — {context_json}
```

Example output:
```
[INFO]  2026-07-24T10:30:00.000Z New connection established — {"port":51423}
[ERROR] 2026-07-24T10:30:01.000Z Upgrade validation failed — {"reason":"origin not allowed"}
```

### Log Level Rules

| Level | When to use |
|---|---|
| `DEBUG` | Internal state transitions (frame parsing steps, buffer sizes) |
| `INFO`  | Lifecycle events (connection open/close, handshake complete) |
| `WARN`  | Recoverable issues (payload approaching max size, unexpected but handled opcode) |
| `ERROR` | Non-recoverable issues that cause a close or crash |

- Context object is optional but preferred over string concatenation.
- `LOG_LEVEL` environment variable controls minimum log level. Default: `INFO`.

---

## 4. Design Principles — Readability Over Cleverness

This project is intentionally kept **simple and readable**. The guiding principle is:

> **If a design pattern or architectural rule makes the code harder to understand, skip it.**

### What this means in practice

- **No EventEmitter** for `WebSocketReceiver`. Instead, pass callbacks directly in the constructor — it is simpler to read and trace.
  ```js
  // Callbacks are passed in, no .emit() needed
  const receiver = new WebSocketReceiver(socket, {
      onMessage: (payload, opcode) => { ... },
      onClose:   (code, reason)    => { ... },
      onError:   (code, reason)    => { ... }
  });
  ```

- **Single Responsibility is the main rule to follow.** Each file should do one thing. If a file starts doing two unrelated things, split it.

- **Don't over-abstract.** If you only have one handler (EchoHandler), a base `Handler` class is fine, but don't build plugin registries or factory patterns for it.

- **Dependency injection where it's obvious.** `WebSocketConnection` receives the handler in its constructor. That's it. No IoC containers, no service locators.

- **SOLID is a guide, not a law.** Follow Single Responsibility always. Apply the others only when they make the code cleaner, not when they add layers.

---

## 5. Change Documentation Protocol

**Every change to the codebase must be documented.** This ensures any future agent can pick up exactly where you left off without reading all the code.

### Step-by-Step Process for Every Change

1. **Confirm the change with the user first.** Work is done one task at a time, in the order the user specifies.
2. **Make the changes.**
3. **Write/update tests** for every new function or class.
4. **Run the tests**: `node --test new-server/tests/` and confirm they pass.
5. **Append to `new-server/CHANGELOG.md`** (see format below). This is NOT optional.
6. **Update `PROJECT_KNOWLEDGE.md`** if you added a new module, changed an interface, or discovered a new constraint.

### `CHANGELOG.md` Entry Format

```markdown
## [YYYY-MM-DD] — [Short title of change]

**Changed by**: [Agent name or "User"]
**Files modified**: [comma-separated list of files]
**Summary**: 1-2 sentence description of what changed and why.
**Status**: Complete | Partial | Needs Follow-up
**Tests added**: Yes — [test file] | No | N/A
**Known issues introduced**: None | [description]
```

---

## 6. Testing Rules

- **Every new class or function must have at least one test.**
- Tests live in `new-server/tests/`. Name the test file after the module it tests.
- Use Node.js built-in test runner (`node:test`, `node:assert`) — no external test libraries.
- Tests must be runnable with: `node --test new-server/tests/<filename>.test.js`
- Do not commit code that breaks existing tests.

---

## 7. What You Must NEVER Do

- ❌ Use `console.log` anywhere outside `logger/Logger.js`
- ❌ Hardcode port numbers, origin URLs, or protocol constants outside `config/constants.js`
- ❌ Put business logic in `app.js`
- ❌ Have a `Handler` subclass access the raw socket directly
- ❌ Have `WebSocketReceiver` send data to the socket
- ❌ Have `WebSocketSender` parse incoming frame data
- ❌ Add unnecessary abstraction layers that make the code harder to read
- ❌ Do more than one task per session without explicit user approval
- ❌ Skip adding a `CHANGELOG.md` entry after making changes
- ❌ Introduce an npm dependency without explicit user approval
- ❌ Commit directly to `main` — always use a feature branch (see Section 10)
- ❌ Write commit messages that don't follow Conventional Commits format (see Section 10)
- ❌ Push code with failing tests — the `pre-commit` hook will block this, but don't use `--no-verify` to bypass it
- ❌ Modify, disable, or delete the `.githooks/` scripts without explicit user approval

---

## 8. Pending Changes — Approved Order of Work

The list below contains all planned changes. The **user dictates the order**. Do only ONE item per session, then stop and report.

| # | Change | Files Affected | Status |
|---|--------|---------------|--------|
| A | Create `logger/Logger.js` | `server/logger/Logger.js` (new) | ✅ Done |
| B | Extract `WebSocketReceiver` from `app.js` into its own file | `server/websocket/WebSocketReceiver.js` (new), `server/app.js` (modify) | 🔲 Not started |
| C | Extract send logic into `WebSocketSender.js` (`_sendEcho` + `_sendClose`) | `server/websocket/WebSocketSender.js` (new) | 🔲 Not started |
| D | Create `WebSocketConnection.js` to wire receiver + sender + socket | `server/websocket/WebSocketConnection.js` (new) | 🔲 Not started |
| E | Create `Handler.js` base class + `EchoHandler.js` | `server/handlers/Handler.js` (new), `server/handlers/EchoHandler.js` (new) | 🔲 Not started |
| F | Create `HttpServer.js` (upgrade logic) + `ConnectionManager.js` | `server/http/HttpServer.js` (new), `server/http/ConnectionManager.js` (new) | 🔲 Not started |
| G | Slim down `app.js` to entry point only | `server/app.js` (modify) | 🔲 Not started |
| H | Add `package.json` with `start` and `test` scripts | `package.json` | ✅ Done |
| I | **Bug fix**: Missing `return` after `_sendClose` in `_getInfo` | `server/app.js` | ✅ Done |
| J | **Bug fix**: Always sends `OPCODE_BINARY` — should preserve original opcode | `server/app.js` | ✅ Done |
| K | **Bug fix**: Ping frames rejected — should respond with pong | `server/app.js` | ✅ Done |
| L | **Bug fix**: Event listener leaks in client HTML | `template.html` | ✅ Done |
| M | **Bug fix**: CSS typo `0,9em` → `0.9em` | `styles.css` | ✅ Done |
| N | Create `ConnectionsRegistry.js` — tracks all active sockets by ID | `server/connections/ConnectionsRegistry.js` (new) | ✅ Done |
| O | Create `RoomManager.js` — join, leave, leaveAll, broadcast | `server/rooms/RoomManager.js` (new), `server/tests/rooms.test.js` (new) | ✅ Done |
| P | Create `MessageRouter.js` — JSON protocol handler for room actions | `server/handlers/MessageRouter.js` (new) | ✅ Done |
| Q | Wire rooms into `app.js` — integrate registry, roomManager, messageRouter; add graceful shutdown | `server/app.js` (modify) | ✅ Done |
| R | Update `template.html` with room UI (join/leave/send) | `template.html` | ✅ Done |

> **Note to agent**: When the user picks an item, mark its Status as `🔄 In progress`, complete it, run tests, update CHANGELOG, then mark it `✅ Done`. Never pick the next item without being told to.

---

## 9. Quick-Start Checklist for a New Agent

If you are a new agent starting a session on this project, run through this checklist:

- [ ] Read `AGENTS.md` (this file) — **you are here**
- [ ] Read `.agents/PROJECT_KNOWLEDGE.md` for current project state
- [ ] Read `server/CHANGELOG.md` for recent changes
- [ ] Scan `server/` directory listing
- [ ] Verify git hooks are active: `git config core.hooksPath` should output `.githooks`
- [ ] Check which branch you're on: `git branch --show-current`
- [ ] If on `main`, create a feature branch before making changes (see Section 10)
- [ ] Ask the user which item from the Pending Changes table (Section 8) they want done
- [ ] Do only that one item — no more
- [ ] After changes: run tests, commit with Conventional Commits format, append to CHANGELOG, update PROJECT_KNOWLEDGE

---

## 10. Git Workflow — Branching, Commits, and Hooks

### Branch Strategy

**`main` is always stable.** All development happens on feature branches.

- **Never commit directly to `main`.** Always branch off, do your work, merge back.
- **One feature per branch.** Don't mix unrelated changes.
- **Merge with squash** to keep `main` history clean.

#### Branch Naming Convention

| Prefix | Use For | Example |
|--------|---------|--------|
| `feature/` | New functionality | `feature/rooms-and-broadcasting` |
| `bugfix/` | Bug fixes | `bugfix/opcode-preservation` |
| `refactor/` | Code restructuring | `refactor/extract-websocket-receiver` |
| `chore/` | Config, docs, tooling | `chore/add-package-json` |

#### Branch Lifecycle

```bash
# 1. Create a feature branch from main
git checkout main
git checkout -b feature/your-feature-name

# 2. Make changes, commit on the feature branch
git add .
git commit -m "feat: your description"

# 3. When done, merge back to main with squash
git checkout main
git merge --squash feature/your-feature-name
git commit -m "feat: your feature summary"

# 4. Delete the feature branch
git branch -d feature/your-feature-name

# 5. Push main
git push origin main
```

### Commit Message Convention — Conventional Commits

Every commit message MUST follow this format:

```
<type>: <description>
```

**Valid types:**

| Type | When to use |
|------|------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no new features, no bug fixes) |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Build, config, tooling changes |
| `style` | Code style / formatting (no logic change) |
| `perf` | Performance improvement |

**Optional scope:** `feat(rooms): add join support`
**Breaking changes:** `feat!: redesign message protocol`
**Max first line length:** 72 characters

### Git Hooks (`.githooks/`)

Three hooks are active and enforced via `git config core.hooksPath .githooks`:

| Hook | Trigger | What it does |
|------|---------|-------------|
| `pre-commit` | Before every `git commit` | Runs `npm test`. Blocks commit if tests fail. |
| `commit-msg` | After writing commit message | Validates Conventional Commits format. Blocks if invalid. |
| `pre-push` | Before every `git push` | Blocks direct pushes to `main`. Runs tests again. |

**If hooks are not active** (e.g., fresh clone), run:
```bash
git config core.hooksPath .githooks
```

**NEVER bypass hooks with `--no-verify`** unless explicitly approved by the user.

---

## 11. Custom Workspace Guidelines

### Documentation & Approval First
- Always document proposed changes and present technical plans/rationale to the user before taking action or modifying code/git history.

### Git Push Restrictions
- **STRICT RULE**: The agent is NOT allowed to execute `git push` or push changes/branches to any remote repository under any circumstances.
- All remote git push actions must be performed manually by the user.

### Core Engine in `app.js`
- Keep the core WebSocket receiver engine in `app.js` unless explicitly instructed otherwise.

### No `dotenv` Dependency
- Do not use `dotenv` or `.env` files. Runtime configuration is managed in `server/config/constants.js`.
