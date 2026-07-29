const Logger = require('../logger/Logger');

let _nextId = 1;

class ConnectionRegistry {
    
    constructor() {
        this._connections = new Map();    
    }

    generateId() {
        return `conn_${_nextId++}`;
    }

    register(connectionId, socket) {
        this._connections.set(connectionId, socket);
        Logger.info("Connection Registered", { connectionId, total: this._connections.size });
    }

    unregister(connectionId) {
        this._connections.delete(connectionId);
        Logger.info("Connection Unregistered", { connectionId, total: this._connections.size });
    }

    getSocket(connectionId) {
        return this._connections.get(connectionId) || null;
    }

    getAllIds() {
        return Array.from(this._connections.keys());
    }

    getCount() {
        return this._connections.size;
    }
}

module.exports = new ConnectionRegistry();