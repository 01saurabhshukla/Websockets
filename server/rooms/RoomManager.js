const Logger = require('../logger/Logger');
const connectionRegistry = require('../connections/ConnectionsRegistry');

class RoomManager {

    constructor(reg) {
        this._registry = reg || connectionRegistry;
        this._rooms = new Map();
    }

    join(roomName, connectionId) {
        if (!this._rooms.has(roomName)) {
            this._rooms.set(roomName, new Set());
            Logger.info("Room Created", { room: roomName });
        }

        this._rooms.get(roomName).add(connectionId);
        const memberCount = this._rooms.get(roomName).size;
        Logger.info("User joined room", { room: roomName, connectionId, members: memberCount });

        return memberCount;
    }

    leave(roomName, connectionId) {
        const room = this._rooms.get(roomName);
        if (!room) return 0;

        room.delete(connectionId);
        const memberCount = room.size;

        if (memberCount === 0) {
            this._rooms.delete(roomName);
            Logger.info("Room Deleted (empty)", { room: roomName });
        } else {
            Logger.info('User left room', { room: roomName, connectionId, members: memberCount });
        }

        return memberCount;
    }

    leaveAll(connectionId) {
        const leftRooms = [];
        for (const [roomName, members] of this._rooms.entries()) {
            if (members.has(connectionId)) {
                members.delete(connectionId);
                leftRooms.push(roomName);

                if (members.size === 0) {
                    this._rooms.delete(roomName);
                    Logger.info("Room Deleted (empty)", { room: roomName });
                }
            }
        }
        return leftRooms;
    }

    getRooms(connectionId) {
        const result = [];
        for (const [roomName, members] of this._rooms.entries()) {
            if (members.has(connectionId)) {
                result.push(roomName);
            }
        }
        return result;
    }

    // Get all member IDs in a room
    getMembers(roomName) {
        const room = this._rooms.get(roomName);
        return room ? Array.from(room) : [];
    }

    // Get member count for a room
    getMemberCount(roomName) {
        const room = this._rooms.get(roomName);
        return room ? room.size : 0;
    }

    // Broadcast a message to all members of a room EXCEPT the sender
    broadcast(roomName, message, senderConnectionId, sendFrameFn) {
        const room = this._rooms.get(roomName);
        if (!room) return 0;

        let sent = 0;
        for (const memberId of room) {
            if (memberId !== senderConnectionId) {
                const socket = this._registry.getSocket(memberId);
                if (socket && !socket.destroyed) {
                    sendFrameFn(socket, message);
                    sent++;
                }
            }
        }

        Logger.debug('Broadcast sent', { room: roomName, recipients: sent });
        return sent;
    }

}

module.exports = new RoomManager(connectionRegistry);
