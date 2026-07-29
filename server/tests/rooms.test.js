'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const registry = require('../connections/ConnectionRegistry');
const roomManager = require('../rooms/RoomManager');
const MessageRouter = require('../handlers/MessageRouter');

describe('Room & Connection Management Unit Tests', () => {

    it('ConnectionRegistry generates unique IDs and tracks sockets', () => {
        const mockSocket = { remotePort: 12345, destroyed: false };
        const id1 = registry.generateId();
        const id2 = registry.generateId();

        assert.notStrictEqual(id1, id2);

        registry.register(id1, mockSocket);
        assert.strictEqual(registry.getSocket(id1), mockSocket);
        assert.strictEqual(registry.getCount() >= 1, true);

        registry.unregister(id1);
        assert.strictEqual(registry.getSocket(id1), null);
    });

    it('RoomManager handles join, leave, leaveAll, and member count', () => {
        const userA = 'conn_test_A';
        const userB = 'conn_test_B';
        const roomName = 'test-room';

        const count1 = roomManager.join(roomName, userA);
        assert.strictEqual(count1, 1);

        const count2 = roomManager.join(roomName, userB);
        assert.strictEqual(count2, 2);

        assert.deepStrictEqual(roomManager.getMembers(roomName), [userA, userB]);
        assert.strictEqual(roomManager.getMemberCount(roomName), 2);

        const leftCount = roomManager.leave(roomName, userA);
        assert.strictEqual(leftCount, 1);

        const leftRooms = roomManager.leaveAll(userB);
        assert.deepStrictEqual(leftRooms, [roomName]);
        assert.strictEqual(roomManager.getMemberCount(roomName), 0);
    });

    it('MessageRouter routes join, room message, leave, and list_rooms', () => {
        const sentFrames = [];
        const sendFrameFn = (socket, msg) => {
            sentFrames.push({ socket, msg: JSON.parse(msg) });
        };

        const mockSocket1 = { id: 1, destroyed: false };
        const mockSocket2 = { id: 2, destroyed: false };

        const id1 = 'user_1';
        const id2 = 'user_2';

        registry.register(id1, mockSocket1);
        registry.register(id2, mockSocket2);

        const router = new MessageRouter(roomManager, registry, sendFrameFn);

        // User 1 joins general room
        router.handleMessage(id1, JSON.stringify({ action: 'join', room: 'general' }));
        assert.strictEqual(sentFrames.length, 1);
        assert.strictEqual(sentFrames[0].msg.action, 'joined');
        assert.strictEqual(sentFrames[0].msg.room, 'general');

        // User 2 joins general room
        sentFrames.length = 0;
        router.handleMessage(id2, JSON.stringify({ action: 'join', room: 'general' }));
        assert.strictEqual(sentFrames.length, 2); // 1 confirmation to user2, 1 notification to user1
        assert.strictEqual(sentFrames[0].msg.action, 'joined');
        assert.strictEqual(sentFrames[1].msg.action, 'user_joined');

        // User 1 broadcasts message to general room
        sentFrames.length = 0;
        router.handleMessage(id1, JSON.stringify({ action: 'message', room: 'general', text: 'Hello!' }));
        assert.strictEqual(sentFrames.length, 1);
        assert.strictEqual(sentFrames[0].msg.action, 'message');
        assert.strictEqual(sentFrames[0].msg.text, 'Hello!');
        assert.strictEqual(sentFrames[0].msg.from, id1);

        // User 1 lists rooms
        sentFrames.length = 0;
        router.handleMessage(id1, JSON.stringify({ action: 'list_rooms' }));
        assert.strictEqual(sentFrames.length, 1);
        assert.strictEqual(sentFrames[0].msg.action, 'room_list');
        assert.deepStrictEqual(sentFrames[0].msg.rooms, ['general']);

        // Cleanup
        roomManager.leaveAll(id1);
        roomManager.leaveAll(id2);
        registry.unregister(id1);
        registry.unregister(id2);
    });

});
