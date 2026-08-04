const Logger = require('../logger/Logger');
const TicTacToeGame = require('./TicTacToeGame');
const roomManager = require('../rooms/RoomManager');
const connectionRegistry = require('../connections/ConnectionRegistry');

class GameManager {
    constructor(roomMgr = roomManager, connRegistry = connectionRegistry) {
        this.roomManager = roomMgr;
        this.connectionRegistry = connRegistry;
        this.matches = new Map(); // matchId -> { game, players: { X: connId|null, O: connId|null } }
        this.matchCounter = 0;
    }

    createMatch() {
        this.matchCounter += 1;
        const matchId = `match_${this.matchCounter}`;
        const game = new TicTacToeGame();

        this.matches.set(matchId, {
            game,
            players: { X: null, O: null }
        });

        Logger.info('TicTacToe match created', { matchId });
        return matchId;
    }

    getMatch(matchId) {
        return this.matches.get(matchId) || null;
    }

    getMatchState(matchId) {
        const match = this.getMatch(matchId);
        return match ? match.game.getState() : null;
    }

    joinAsPlayer(matchId, connectionId) {
        const match = this.getMatch(matchId);
        if (!match) {
            return { ok: false, error: 'Match not found' };
        }

        if (match.players.X === connectionId) {
            return { ok: true, role: 'player', mark: 'X', state: match.game.getState() };
        }
        if (match.players.O === connectionId) {
            return { ok: true, role: 'player', mark: 'O', state: match.game.getState() };
        }

        let assignedMark = null;
        if (match.players.X === null) {
            match.players.X = connectionId;
            assignedMark = 'X';
        } else if (match.players.O === null) {
            match.players.O = connectionId;
            assignedMark = 'O';
        } else {
            return { ok: false, error: 'Match is full, join as spectator' };
        }

        const roomName = `ttt:${matchId}`;
        this.roomManager.join(roomName, connectionId);

        Logger.info('User joined match as player', { matchId, connectionId, mark: assignedMark });
        return {
            ok: true,
            role: 'player',
            mark: assignedMark,
            state: match.game.getState()
        };
    }

    joinAsSpectator(matchId, connectionId) {
        const match = this.getMatch(matchId);
        if (!match) {
            return { ok: false, error: 'Match not found' };
        }

        const roomName = `ttt:${matchId}`;
        this.roomManager.join(roomName, connectionId);

        Logger.info('User joined match as spectator', { matchId, connectionId });
        return {
            ok: true,
            role: 'spectator',
            mark: null,
            state: match.game.getState()
        };
    }

    makeMove(matchId, connectionId, cellIndex) {
        const match = this.getMatch(matchId);
        if (!match) {
            return { ok: false, error: 'Match not found' };
        }

        let mark = null;
        if (match.players.X === connectionId) {
            mark = 'X';
        } else if (match.players.O === connectionId) {
            mark = 'O';
        }

        if (!mark) {
            return { ok: false, error: 'Only active players can make moves' };
        }

        const res = match.game.makeMove(mark, cellIndex);
        if (!res.ok) {
            return res;
        }

        return {
            ok: true,
            state: match.game.getState(),
            roomName: `ttt:${matchId}`
        };
    }

    leaveMatch(matchId, connectionId) {
        const match = this.getMatch(matchId);
        if (!match) {
            return { ok: false, error: 'Match not found' };
        }

        const roomName = `ttt:${matchId}`;

        if (match.players.X === connectionId) {
            match.players.X = null;
        }
        if (match.players.O === connectionId) {
            match.players.O = null;
        }

        this.roomManager.leave(roomName, connectionId);
        Logger.info('User left match', { matchId, connectionId });

        const remainingMembers = this.roomManager.getMemberCount(roomName);
        if (remainingMembers === 0 && match.players.X === null && match.players.O === null) {
            this.matches.delete(matchId);
            Logger.info('TicTacToe match deleted (empty)', { matchId });
            return { ok: true, state: null, matchDeleted: true };
        }

        return { ok: true, state: match.game.getState(), matchDeleted: false };
    }

    leaveAllMatches(connectionId) {
        const updatedMatches = [];
        for (const [matchId, match] of this.matches.entries()) {
            const roomName = `ttt:${matchId}`;
            const isMember = this.roomManager.getMembers(roomName).includes(connectionId);
            const isPlayer = match.players.X === connectionId || match.players.O === connectionId;

            if (isMember || isPlayer) {
                const res = this.leaveMatch(matchId, connectionId);
                updatedMatches.push({ matchId, ...res });
            }
        }
        return updatedMatches;
    }

    listMatches() {
        const list = [];
        for (const [matchId, match] of this.matches.entries()) {
            const roomName = `ttt:${matchId}`;
            const totalMembers = this.roomManager.getMemberCount(roomName);
            const playerXCount = match.players.X ? 1 : 0;
            const playerOCount = match.players.O ? 1 : 0;
            const spectatorCount = Math.max(0, totalMembers - playerXCount - playerOCount);

            list.push({
                matchId,
                players: {
                    X: match.players.X,
                    O: match.players.O
                },
                spectatorCount,
                status: match.game.getState().status
            });
        }
        return list;
    }
}

const singleton = new GameManager(roomManager, connectionRegistry);
singleton.GameManager = GameManager; // DONE SO TEST CASE REQUIREMENTS CAN BE MET

/**
 * In unit tests (like game-manager.test.js), 
 * tests must not share global state with each other. 
 * Each test needs a brand-new, 
 * isolated instance of GameManager with clean mock dependencies:
 */

// singleton.GameManager = GameManager is done so the file can serve two purposes at once without needing separate files:
// In normal application code (like MessageRouter.js or app.js), you want to require('./GameManager') and immediately start using the shared global instance without instantiating it yourself:

// const gameManager = require('../games/GameManager');
// gameManager.createMatch(); // Uses global shared state singleton


// 2. Class Constructor Export (For Testing & Isolation)
// In unit tests (like game-manager.test.js), 
// tests must not share global state with each other. 
// Each test needs a brand-new, isolated instance of GameManager with clean mock dependencies:

// const { GameManager } = require('../games/GameManager');
// const testGameMgr = new GameManager(cleanRoomMgr, cleanRegistry); // Isolated fresh instance per test
// Attaching .GameManager = GameManager to the exported singleton object allows both import styles to work seamlessly!

module.exports = singleton;
