'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const ConnectionRegistry = require('../connections/ConnectionRegistry').constructor;
const RoomManager = require('../rooms/RoomManager').constructor;

// every object instance has a .constructor property pointing back to the Class that created it!
// .constructor extracts the Class back out from the singleton instance!

const { GameManager } = require('../games/GameManager');
const MessageRouter = require('../handlers/MessageRouter');

describe('GameManager Unit & Integration Tests', () => {

    function createTestContext() {
        const registry = new ConnectionRegistry();
        const roomMgr = new RoomManager(registry);
        const gameMgr = new GameManager(roomMgr, registry);
        return { registry, roomMgr, gameMgr };
    }

    it('creates matches and lists them', () => {
        const { gameMgr } = createTestContext();
        const matchId = gameMgr.createMatch();

        assert.strictEqual(typeof matchId, 'string');
        assert.strictEqual(matchId.startsWith('match_'), true);

        const list = gameMgr.listMatches();
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].matchId, matchId);
        assert.strictEqual(list[0].players.X, null);
        assert.strictEqual(list[0].players.O, null);
        assert.strictEqual(list[0].spectatorCount, 0);
        assert.strictEqual(list[0].status, 'in_progress');
    });

    it('assigns X and O to first two players; rejects third player as full', () => {
        const { gameMgr } = createTestContext();
        const matchId = gameMgr.createMatch();

        const resA = gameMgr.joinAsPlayer(matchId, 'conn_player_A');
        assert.strictEqual(resA.ok, true);
        assert.strictEqual(resA.role, 'player');
        assert.strictEqual(resA.mark, 'X');

        const resB = gameMgr.joinAsPlayer(matchId, 'conn_player_B');
        assert.strictEqual(resB.ok, true);
        assert.strictEqual(resB.role, 'player');
        assert.strictEqual(resB.mark, 'O');

        const resC = gameMgr.joinAsPlayer(matchId, 'conn_player_C');
        assert.strictEqual(resC.ok, false);
        assert.strictEqual(resC.error, 'Match is full, join as spectator');
    });

    it('allows spectators to join without consuming player slots', () => {
        const { gameMgr, roomMgr } = createTestContext();
        const matchId = gameMgr.createMatch();

        gameMgr.joinAsPlayer(matchId, 'conn_player_X');

        const resSpec = gameMgr.joinAsSpectator(matchId, 'conn_spectator_1');
        assert.strictEqual(resSpec.ok, true);
        assert.strictEqual(resSpec.role, 'spectator');
        assert.strictEqual(resSpec.mark, null);

        const match = gameMgr.getMatch(matchId);
        assert.strictEqual(match.players.X, 'conn_player_X');
        assert.strictEqual(match.players.O, null);

        const memberCount = roomMgr.getMemberCount(`ttt:${matchId}`);
        assert.strictEqual(memberCount, 2); // 1 player + 1 spectator

        const list = gameMgr.listMatches();
        assert.strictEqual(list[0].spectatorCount, 1);
    });

    it('enforces turn order and prevents spectators from moving', () => {
        const { gameMgr } = createTestContext();
        const matchId = gameMgr.createMatch();

        gameMgr.joinAsPlayer(matchId, 'conn_X');
        gameMgr.joinAsPlayer(matchId, 'conn_O');
        gameMgr.joinAsSpectator(matchId, 'conn_Spec');

        // Spectator tries to move -> rejected
        const resSpec = gameMgr.makeMove(matchId, 'conn_Spec', 0);
        assert.strictEqual(resSpec.ok, false);
        assert.strictEqual(resSpec.error, 'Only active players can make moves');

        // Player O tries to move on turn X -> rejected
        const resO = gameMgr.makeMove(matchId, 'conn_O', 0);
        assert.strictEqual(resO.ok, false);
        assert.strictEqual(resO.error, "Not O's turn");

        // Player X moves on turn X -> accepted
        const resX = gameMgr.makeMove(matchId, 'conn_X', 0);
        assert.strictEqual(resX.ok, true);
        assert.strictEqual(resX.state.board[0], 'X');
        assert.strictEqual(resX.state.turn, 'O');
    });

    it('frees player slot on leaveMatch and leaveAllMatches', () => {
        const { gameMgr } = createTestContext();
        const matchId = gameMgr.createMatch();

        gameMgr.joinAsPlayer(matchId, 'conn_X');
        gameMgr.joinAsPlayer(matchId, 'conn_O');

        // conn_X leaves match
        const leaveRes = gameMgr.leaveMatch(matchId, 'conn_X');
        assert.strictEqual(leaveRes.ok, true);

        // A new player can now join as X
        const newPlayerRes = gameMgr.joinAsPlayer(matchId, 'conn_NewX');
        assert.strictEqual(newPlayerRes.ok, true);
        assert.strictEqual(newPlayerRes.mark, 'X');

        // conn_O disconnects via leaveAllMatches
        gameMgr.leaveAllMatches('conn_O');
        const match = gameMgr.getMatch(matchId);
        assert.strictEqual(match.players.O, null);
    });

    it('MessageRouter routes ttt_create, ttt_join, ttt_move, ttt_list, and ttt_leave', () => {
        const { registry, roomMgr, gameMgr } = createTestContext();
        const sentFrames = [];
        const sendFrameFn = (socket, msg) => {
            sentFrames.push({ socket, msg: JSON.parse(msg) });
        };

        const router = new MessageRouter(roomMgr, registry, sendFrameFn, gameMgr);
        const sock1 = { id: 's1', destroyed: false };
        const sock2 = { id: 's2', destroyed: false };
        const user1 = 'conn_u1';
        const user2 = 'conn_u2';

        registry.register(user1, sock1);
        registry.register(user2, sock2);

        // 1. ttt_create
        router.handleMessage(user1, JSON.stringify({ action: 'ttt_create' }));
        assert.strictEqual(sentFrames.length, 1);
        assert.strictEqual(sentFrames[0].msg.action, 'ttt_created');
        const matchId = sentFrames[0].msg.matchId;

        // 2. ttt_join user1 (Player X)
        sentFrames.length = 0;
        router.handleMessage(user1, JSON.stringify({ action: 'ttt_join', matchId }));
        assert.strictEqual(sentFrames.length, 1);
        assert.strictEqual(sentFrames[0].msg.action, 'ttt_state');
        assert.strictEqual(sentFrames[0].msg.yourRole, 'player');
        assert.strictEqual(sentFrames[0].msg.yourMark, 'X');

        // 3. ttt_join user2 (Player O)
        sentFrames.length = 0;
        router.handleMessage(user2, JSON.stringify({ action: 'ttt_join', matchId }));
        assert.strictEqual(sentFrames.length, 2); // 1 state to user2, 1 broadcast to user1
        assert.strictEqual(sentFrames[0].msg.action, 'ttt_state');
        assert.strictEqual(sentFrames[0].msg.yourMark, 'O');

        // 4. ttt_move user1 (X at cell 0)
        sentFrames.length = 0;
        router.handleMessage(user1, JSON.stringify({ action: 'ttt_move', matchId, cell: 0 }));
        assert.strictEqual(sentFrames.length, 2); // state to sender + broadcast to room
        assert.strictEqual(sentFrames[0].msg.state.board[0], 'X');
        assert.strictEqual(sentFrames[0].msg.state.turn, 'O');

        // 5. ttt_list
        sentFrames.length = 0;
        router.handleMessage(user1, JSON.stringify({ action: 'ttt_list' }));
        assert.strictEqual(sentFrames.length, 1);
        assert.strictEqual(sentFrames[0].msg.action, 'ttt_list');
        assert.strictEqual(sentFrames[0].msg.matches.length, 1);

        // 6. ttt_leave user1
        sentFrames.length = 0;
        router.handleMessage(user1, JSON.stringify({ action: 'ttt_leave', matchId }));
        assert.strictEqual(sentFrames.length, 2); // ack to user1 + broadcast to user2
        assert.strictEqual(sentFrames[0].msg.action, 'ttt_left');

        registry.unregister(user1);
        registry.unregister(user2);
    });

});
