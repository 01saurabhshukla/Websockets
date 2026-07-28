const Logger = require('../logger/Logger');

class MessageRouter {

    constructor(roomManager, connectionRegistry, sendFrameFn) {
        this._roomManager = roomManager;
        this._registry    = connectionRegistry;
        this._sendFrame   = sendFrameFn;
    }

    handleMessage(connectionId, payloadString) {
        let parsed;
        try {
            parsed = JSON.parse(payloadString);
        } catch (error) {
            return this._sendToSender(connectionId, payloadString);
        }

        const action = parsed.action;

        switch (action) {
            case 'join':
                return this._handleJoin(connectionId, parsed.room);
            case 'leave':
                return this._handleLeave(connectionId, parsed.room);
            case 'message':
                return this._handleRoomMessage(connectionId, parsed.room, parsed.text);
            case 'list_rooms':
            case 'list-rooms':
                return this._handleListRooms(connectionId);
            default:
                return this._sendError(connectionId, `Unknown action: ${action}`);
        }
    }

    _handleJoin(connectionId, roomName) {
        if (!roomName) return this._sendError(connectionId, 'Room name is required');

        const memberCount = this._roomManager.join(roomName, connectionId);

        this._sendToSender(connectionId, JSON.stringify({
            action: 'joined',
            room: roomName,
            members: memberCount
        }));

        this._roomManager.broadcast(roomName, JSON.stringify({
            action: 'user_joined',
            room: roomName,
            userId: connectionId,
            members: memberCount
        }), connectionId, this._sendFrame);
    }

    _handleLeave(connectionId, roomName) {
        if (!roomName) return this._sendError(connectionId, 'Room Name is required');

        const memberCount = this._roomManager.leave(roomName, connectionId);

        this._sendToSender(connectionId, JSON.stringify({
            action: 'left',
            room: roomName
        }));

        this._roomManager.broadcast(roomName, JSON.stringify({
            action: 'user_left',
            room: roomName,
            userId: connectionId,
            members: memberCount
        }), connectionId, this._sendFrame);
    }

    _handleRoomMessage(connectionId, roomName, text) {
        if (!roomName) return this._sendError(connectionId, 'room name is required');
        if (!text) return this._sendError(connectionId, 'Message text is required');

        this._roomManager.broadcast(roomName, JSON.stringify({
            action: 'message',
            room: roomName,
            from: connectionId,
            text: text
        }), connectionId, this._sendFrame);
    }

    _handleListRooms(connectionId) {
        const rooms = this._roomManager.getRooms(connectionId);
        this._sendToSender(connectionId, JSON.stringify({
            action: 'room_list',
            rooms: rooms
        }));
    }

    _sendError(connectionId, message) {
        this._sendToSender(connectionId, JSON.stringify({
            action: 'error',
            message: message
        }));
    }

    _sendToSender(connectionId, message) {
        const socket = this._registry.getSocket(connectionId);
        if (socket && !socket.destroyed) {
            this._sendFrame(socket, message);
        }
    }
}

module.exports = MessageRouter;