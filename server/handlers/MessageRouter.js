const Logger = require('../logger/Logger');

class MessageRouter {

    constructor(roomManager, connectionRegistry, sendFrameFn) {
        this._roomManager = roomManager;
        this._registry = connectionRegistry;
        this._sendFrame = sendFrameFn;
    }

    handleMessage(connectionId, payloadString) {
        let parsed;
        try {
            parsed = JSON.parse(payloadString);
        } catch (error) {
            return this._sendToSender(connectionId, payloadString);
        }
        // Logger.info("Input JSON: ", { parsed: parsed });
        const action = parsed.action;

        switch (action) {
            case 'join':
                return this._handleJoin(connectionId, parsed.room);
            case 'leave':
                return this._handleLeave(connectionId, parsed.room);
            case 'message':
                return this._handleRoomMessage(connectionId, parsed.room, parsed.text);
            case 'list_rooms':
                return this._handleListRooms(connectionId);
            case 'list_all_rooms':
                return this._handleListAllRooms(connectionId);
            case 'list_all_users':
                return this._handleListAllUsers(connectionId);
            case 'typing':
                return this._handleTypingNotification(connectionId, parsed.to);
            case 'direct':
                return this._handleDirect(connectionId, parsed.to, parsed.text);
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

    _handleListAllRooms(connectionId) {
        const rooms = this._roomManager.getAllRooms();
        this._sendToSender(connectionId, JSON.stringify({
            action: 'all_rooms_list',
            rooms: rooms
        }));
    }

    _handleListAllUsers(connectionId) {
        const users = this._registry.getAllIds();
        Logger.debug('All Users: ', { users: users });
        this._sendToSender(connectionId, JSON.stringify({
            action: 'all_users',
            users: users
        }));
    }

    _handleTypingNotification(from, to) {
        if (!to || to === from) return;
        const targetSocket = this._registry.getSocket(to);
        if (targetSocket && !targetSocket.destroyed) {
            this._sendFrame(targetSocket, JSON.stringify({
                action: 'typing',
                from: from
            }));
        }
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

    _handleDirect(from, to, text) {

        if (!to) return this._sendError(from, 'Target Connection ID is required');
        if (!text) return this._sendError(from, 'Message text is required');

        if (to === from) return this._sendError(from, 'direct message to themselv is prohibited');

        const targetSocket = this._registry.getSocket(to);
        if (!targetSocket || targetSocket.destroyed) {
            return this._sendError(from, `Connection "${to}" not found or disconnected`);
        }

        this._sendFrame(targetSocket, JSON.stringify({
            action: 'direct',
            from: from,
            text: text
        }));

        this._sendToSender(from, JSON.stringify({
            action: 'direct_sent',
            to: to
        }));
        Logger.debug('Direct message delivered', { from, to });
    }
}

module.exports = MessageRouter;