const http = require('http');
const CONSTANTS = require('./config/constants');
const UTILITIES = require('./utilities/utilities');
const Logger = require('./logger/Logger');
const connectionRegistry = require('./connections/ConnectionRegistry');
const roomManager = require('./rooms/RoomManager');
const MessageRouter = require('./handlers/MessageRouter');

// Standalone function to construct and send RFC 6455 WebSocket frames to any socket
function sendFrame(socket, message, opcode = CONSTANTS.OPCODE_TEXT) {
    if (!socket || socket.destroyed) return;

    const payload = Buffer.isBuffer(message) ? message : Buffer.from(String(message), 'utf8');
    const payloadLength = payload.length;

    let additionalPayloadSizeIndicator = 0;
    if (payloadLength > CONSTANTS.SMALL_DATA_SIZE && payloadLength <= CONSTANTS.MEDIUM_DATA_SIZE) {
        additionalPayloadSizeIndicator = CONSTANTS.MEDIUM_SIZE_CONSUMPTION;
    } else if (payloadLength > CONSTANTS.MEDIUM_DATA_SIZE) {
        additionalPayloadSizeIndicator = CONSTANTS.LARGE_SIZE_CONSUMPTION;
    }

    const frame = Buffer.alloc(CONSTANTS.MIN_FRAME_SIZE + additionalPayloadSizeIndicator + payloadLength);
    
    // FIN (1) + RSV (0) + Opcode
    const firstByte = 0b10000000 | (opcode & 0x0f);
    frame[0] = firstByte;

    // Masking bit (0 for server to client)
    const maskingBit = 0x00;

    if (payloadLength <= CONSTANTS.SMALL_DATA_SIZE) {
        frame[1] = (maskingBit | payloadLength);
    } else if (payloadLength <= CONSTANTS.MEDIUM_DATA_SIZE) {
        frame[1] = (maskingBit | CONSTANTS.MEDIUM_DATA_FLAG);
        frame.writeUInt16BE(payloadLength, CONSTANTS.MIN_FRAME_SIZE);
    } else {
        frame[1] = (maskingBit | CONSTANTS.LARGE_DATA_FLAG);
        frame.writeBigInt64BE(BigInt(payloadLength), CONSTANTS.MIN_FRAME_SIZE);
    }

    const startOffset = CONSTANTS.MIN_FRAME_SIZE + additionalPayloadSizeIndicator;
    payload.copy(frame, startOffset);

    socket.write(frame);
}

// Initialize MessageRouter with RoomManager, ConnectionRegistry, and sendFrame helper
const messageRouter = new MessageRouter(roomManager, connectionRegistry, sendFrame);

// Defining our looping engine variables
const GET_INFO = 1;
const GET_LENGTH = 2; 
const GET_MASK_KEY = 3; 
const GET_PAYLOAD = 4; 
const SEND_ECHO = 5;  
const GET_CLOSE_INFO = 6; 

// Server object creation
const http_server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Hello World!');
});

// Starting server
http_server.listen(CONSTANTS.PORT, '0.0.0.0', () => {
    Logger.info(`The http server is listening on port ${CONSTANTS.PORT}`);
});

// Helper function for clean process shutdown
function gracefulShutdown(reason, exitCode = 0, closeCode = 1001) {
    Logger.info(`Initiating graceful shutdown (${reason})...`);
    const allIds = connectionRegistry.getAllIds();

    for (const connectionId of allIds) {
        const socket = connectionRegistry.getSocket(connectionId);
        if (socket && !socket.destroyed) {
            // Send RFC 6455 Close Frame with Code 1001 (Going Away) or 1011 (Internal Error)
            const closeFramePayload = Buffer.alloc(2);
            closeFramePayload.writeInt16BE(closeCode, 0);
            const firstByte = 0b10000000 | 0b00001000; // FIN (1) + OPCODE (8)
            const secondByte = closeFramePayload.length;
            const header = Buffer.from([firstByte, secondByte]);
            const closeFrame = Buffer.concat([header, closeFramePayload]);
            socket.write(closeFrame);
            socket.end();
        }
    }

    setTimeout(() => {
        http_server.close(() => {
            Logger.info('Server closed cleanly.');
            process.exit(exitCode);
        });
    }, 500);
}

// Graceful shutdown on OS Process Signals (SIGINT / SIGTERM)
CONSTANTS.SHUTDOWN_SIGNALS.forEach(signal => {
    process.on(signal, () => {
        gracefulShutdown(signal, 0, 1001);
    });
});

// Graceful shutdown on Fatal Runtime Errors (uncaughtException / unhandledRejection)
CONSTANTS.FATAL_ERRORS.forEach(errorEvent => {
    process.on(errorEvent, (err) => {
        Logger.error(`Caught fatal runtime error: ${errorEvent}`, { error: err.stack || err.message || err });
        gracefulShutdown(errorEvent, 1, 1011);
    });
});

http_server.on('upgrade', (req, socket, head) => { 
    const upgradeHeaderCheck = req.headers['upgrade'].toLowerCase() === CONSTANTS.UPGRADE;
    const connectionHeaderCheck = req.headers['connection'].toLowerCase() === CONSTANTS.CONNECTION;
    const methodCheck = req.method === CONSTANTS.METHOD;

    const origin = req.headers['origin'];
    const originCheck = UTILITIES.isOriginAllowed(origin);
    
    if (UTILITIES.check(socket, upgradeHeaderCheck, connectionHeaderCheck, methodCheck, originCheck)) {
        upgradeConnection(req, socket, head);
    }
});

function upgradeConnection(req, socket, head) {
    const clientKey = req.headers['sec-websocket-key'];
    const headers   = UTILITIES.createUpgradeHeaders(clientKey);
    socket.write(headers);
    startWebSocketConnection(socket);
}

function startWebSocketConnection(socket) {
    const connectionId = connectionRegistry.generateId();
    connectionRegistry.register(connectionId, socket);

    Logger.info(`WS CONNECTION ESTABLISHED`, { connectionId, port: socket.remotePort });
    
    sendFrame(socket, JSON.stringify({
        action: 'welcome',
        connectionId: connectionId
    }));

    const receiver = new WebSocketReceiver(socket, connectionId);

    receiver.startHeartbeat();

    socket.on('data', (chunk) => {
        receiver.processBuffer(chunk);
    });

    socket.on('end', () => {
        Logger.info('Closing Connection (socket end)...', { connectionId });
        receiver.stopHeartbeat();
    });

    socket.on('close', () => {
        receiver.stopHeartbeat();
        const leftRooms = roomManager.leaveAll(connectionId);
        connectionRegistry.unregister(connectionId);

        // Notify members in each left room
        for (const roomName of leftRooms) {
            const memberCount = roomManager.getMemberCount(roomName);
            roomManager.broadcast(roomName, JSON.stringify({
                action: 'user_left',
                room: roomName,
                userId: connectionId,
                members: memberCount
            }), connectionId, sendFrame);
        }
    });
}


class WebSocketReceiver {

    constructor(socket, connectionId) {
        this._socket = socket;
        this._connectionId = connectionId;
    }

    // Define properties 
    _buffersArray = [];
    _bufferedBytesLength = 0;
    _taskLoop = false; 
    _task = GET_INFO;
    _fin = false; // Indicates if the final fragment of a message has been received.
    _opcode = null; // Opcode representing the type of received data.
    _messageOpcode = null; // Opcode of the first frame in a message (text vs binary).
    _masked = false; // Indicates whether the received frame is masked.
    _initialPayloadSizeIndicator = 0; // Size indicator for the payload being processed.
    _framePayloadLength = 0; // length of one WebSocket frame received
    _maxPayload = 1024 * 1024; // this value is 1 megabyte (MiB) in size
    _totalPayloadLength = 0; 
    _mask = Buffer.alloc(CONSTANTS.MASK_LENGTH); // this will hold the masking key set and sent by the client
    _framesReceived = 0; // tally of how many frames have been received related to our websocket message
    _fragments = []; // store fragments (frames) for reassembly 
    _isAlive = true;
    _heartbeatTimer = null;

    processBuffer(chunk) {
        this._buffersArray.push(chunk);
        this._bufferedBytesLength += chunk.length;

        Logger.debug("Chunk received", { size: chunk.length });
        this._startTaskLoop();
    }

    _startTaskLoop() {
        this._taskLoop = true;

        do {
            switch (this._task) {
                case GET_INFO:
                    this._getInfo();
                    break;
                case GET_LENGTH:
                    this._getLength();
                    break;
                case GET_MASK_KEY: 
                    this._getMaskKey();
                    break;
                case GET_PAYLOAD: 
                    this._getPayload();
                    break;
                case SEND_ECHO:
                    this._sendEcho();
                    break;
                case GET_CLOSE_INFO: 
                    this._getCloseInfo();
                    break;  
            }
        } while (this._taskLoop); 
    }   
    
    _getInfo() {
        if (this._bufferedBytesLength < CONSTANTS.MIN_FRAME_SIZE) {
            this._taskLoop = false;
            return;
        }

        const infoBuffer = this._consumeHeaders(CONSTANTS.MIN_FRAME_SIZE);

        this._fin = Boolean(infoBuffer[0] & 0x80);
        this._opcode = infoBuffer[0] & 0x0f;

        if (this._opcode === CONSTANTS.OPCODE_TEXT || this._opcode === CONSTANTS.OPCODE_BINARY) {
            if (!this._messageOpcode) {
                this._messageOpcode = this._opcode;
            }
        }

        this._masked = Boolean(infoBuffer[1] & 0x80);

        if (!this._masked) {
            this._sendClose(1002, "All client frames must be masked.");
            return;
        }

        this._initialPayloadSizeIndicator = infoBuffer[1] & 0x7F;

        if (this._opcode === CONSTANTS.OPCODE_CLOSE) {
            this._task = GET_CLOSE_INFO;
            return;
        }

        this._task = GET_LENGTH;
    }

    _getLength() {
        if (this._initialPayloadSizeIndicator <= CONSTANTS.SMALL_DATA_SIZE) {
            this._framePayloadLength = this._initialPayloadSizeIndicator;
            this._task = GET_MASK_KEY;
            return;
        }

        if (this._initialPayloadSizeIndicator === CONSTANTS.MEDIUM_DATA_FLAG) {
            if (this._bufferedBytesLength < CONSTANTS.MEDIUM_SIZE_CONSUMPTION) {
                this._taskLoop = false;
                return;
            }
            const lengthBuffer = this._consumeHeaders(CONSTANTS.MEDIUM_SIZE_CONSUMPTION);
            this._framePayloadLength = lengthBuffer.readUInt16BE(0);
            this._task = GET_MASK_KEY;
            return;
        }

        if (this._initialPayloadSizeIndicator === CONSTANTS.LARGE_DATA_FLAG) {
            if (this._bufferedBytesLength < CONSTANTS.LARGE_SIZE_CONSUMPTION) {
                this._taskLoop = false;
                return;
            }
            const lengthBuffer = this._consumeHeaders(CONSTANTS.LARGE_SIZE_CONSUMPTION);
            this._framePayloadLength = Number(lengthBuffer.readBigInt64BE(0));
            this._task = GET_MASK_KEY;
            return;
        }

        this._sendClose(1008, "Invalid payload size indicator");
    }

    _getMaskKey() {
        if (this._bufferedBytesLength < CONSTANTS.MASK_LENGTH) {
            this._taskLoop = false;
            return;
        }

        this._mask = this._consumeHeaders(CONSTANTS.MASK_LENGTH);
        this._task = GET_PAYLOAD;
    }

    _getPayload() {
        if (this._bufferedBytesLength < this._framePayloadLength) {
            this._taskLoop = false;
            return;
        }

        const payloadBuffer = this._consumePayload(this._framePayloadLength);
        const frame_unmasked_payload_buffer = UTILITIES._unmaskPayload(payloadBuffer, this._mask);

        this._totalPayloadLength += this._framePayloadLength;

        if (this._totalPayloadLength > this._maxPayload) {
            this._sendClose(1009, "Payload exceeds 1MiB limits.");
            return;
        }

        this._framesReceived++;
        this._fragments.push(frame_unmasked_payload_buffer);

        if (this._opcode === CONSTANTS.OPCODE_PING) {
            Logger.debug("Received PING Frame. Replying with PONG...");
            this._sendPong(frame_unmasked_payload_buffer);
            return;
        }

        if (this._opcode === CONSTANTS.OPCODE_PONG) {
            Logger.debug("Received PONG response Frame. Connection is Alive.");
            this._isAlive = true;
            this._reset();
            return;
        }

        if (this._opcode === CONSTANTS.OPCODE_CLOSE) {
            this._task = GET_CLOSE_INFO;
            return;
        }

        if (this._framePayloadLength <= 0) {
            this._sendClose(1008, "The message payload cannot be empty.");
            return;
        }

        if (!this._fin) {
            this._task = GET_INFO;
        } else {
            Logger.debug("Full message received", { frames: this._framesReceived, totalBytes: this._totalPayloadLength });
            this._task = SEND_ECHO;
        }
    }

    _consumePayload(n) {
        this._bufferedBytesLength -= n;

        const payloadBuffer = Buffer.alloc(n);
        let totalBytesRead = 0;

        while (totalBytesRead < n) {
            const buf = this._buffersArray[0];
            const bytesToRead = Math.min(n - totalBytesRead, buf.length);

            buf.copy(payloadBuffer, totalBytesRead, 0, bytesToRead);
            totalBytesRead += bytesToRead;

            if (bytesToRead < buf.length) {
                this._buffersArray[0] = buf.slice(bytesToRead);
            } else {
                this._buffersArray.shift();
            }
        }

        return payloadBuffer;
    }

    _consumeHeaders(size) {
        this._bufferedBytesLength -= size;

        if (size === this._buffersArray[0].length) {
            return this._buffersArray.shift();
        }

        if (size < this._buffersArray[0].length) {
            const infoBuffer = this._buffersArray[0];
            this._buffersArray[0] = this._buffersArray[0].slice(size);
            return infoBuffer.slice(0, size);
        } else {
            throw Error('You cannot extract more data from a ws frame than the actual frame size.');
        }
    }

    _reset() {
        this._buffersArray = [];
        this._bufferedBytesLength = 0;
        this._taskLoop = false; 
        this._task = GET_INFO;
        this._fin = false;
        this._opcode = null;
        this._messageOpcode = null;
        this._masked = false;
        this._initialPayloadSizeIndicator = 0;
        this._framePayloadLength = 0;
        this._totalPayloadLength = 0; 
        this._mask = Buffer.alloc(CONSTANTS.MASK_LENGTH);
        this._framesReceived = 0;
        this._fragments = [];
    }

    _sendClose(closeCode, closeReason) {
        let closureCode = (typeof closeCode !== 'undefined' && closeCode) ? closeCode : 1000;
        let closureReasonBuffer = (typeof closeReason !== 'undefined' && closeReason) ? Buffer.from(closeReason) : Buffer.from("Closure by server.");

        let closeFramePayload = Buffer.alloc(2 + closureReasonBuffer.length);
        closeFramePayload.writeInt16BE(closureCode, 0);
        closureReasonBuffer.copy(closeFramePayload, 2);

        const firstByte = 0b10000000 | 0b00001000; // FIN (1) + OPCODE (8)
        const secondByte = closeFramePayload.length;
        const mandatoryCloseHeaders = Buffer.from([firstByte, secondByte]);

        const closeFrame = Buffer.concat([mandatoryCloseHeaders, closeFramePayload]);

        this._socket.write(closeFrame);
        this._socket.end();

        this.stopHeartbeat();
        this._reset();
    }

    _sendEcho() {
        const fullMessage = Buffer.concat(this._fragments);
        const opcode = this._messageOpcode || CONSTANTS.OPCODE_TEXT;

        if (opcode === CONSTANTS.OPCODE_TEXT) {
            const payloadString = fullMessage.toString('utf8');
            messageRouter.handleMessage(this._connectionId, payloadString);
            this._reset();
        } else {
            // Binary data framing & echo
            let payloadLength = fullMessage.length; 
            let additionalPayloadSizeIndicator = 0; 

            if (payloadLength > CONSTANTS.SMALL_DATA_SIZE && payloadLength <= CONSTANTS.MEDIUM_DATA_SIZE) {
                additionalPayloadSizeIndicator = CONSTANTS.MEDIUM_SIZE_CONSUMPTION;
            } else if (payloadLength > CONSTANTS.MEDIUM_DATA_SIZE) {
                additionalPayloadSizeIndicator = CONSTANTS.LARGE_SIZE_CONSUMPTION;
            }

            const frame = Buffer.alloc(CONSTANTS.MIN_FRAME_SIZE + additionalPayloadSizeIndicator + payloadLength);
            
            let fin = 0x01;
            let firstByte = (fin << 7) | CONSTANTS.OPCODE_BINARY;
            frame[0] = firstByte;

            let maskingBit = 0x00;

            if (payloadLength <= CONSTANTS.SMALL_DATA_SIZE) {
                frame[1] = (maskingBit | payloadLength);
            } else if (payloadLength <= CONSTANTS.MEDIUM_DATA_SIZE) {
                frame[1] = (maskingBit | CONSTANTS.MEDIUM_DATA_FLAG);
                frame.writeUInt16BE(payloadLength, CONSTANTS.MIN_FRAME_SIZE);
            } else {
                frame[1] = (maskingBit | CONSTANTS.LARGE_DATA_FLAG);
                frame.writeBigInt64BE(BigInt(payloadLength), CONSTANTS.MIN_FRAME_SIZE);
            }

            const messageStartOffset = CONSTANTS.MIN_FRAME_SIZE + additionalPayloadSizeIndicator;
            fullMessage.copy(frame, messageStartOffset);

            this._socket.write(frame);
            this._reset();
        }
    }

    _getCloseInfo() {
        let closeFramePayload = this._fragments[0];
        if (!closeFramePayload) {
            this._sendClose(1008, "Next time, pls set the status code.");
            return;
        }
        let closeCode = closeFramePayload.readUInt16BE();
        let closeReason = closeFramePayload.toString('utf8', 2);
        if (closeCode === 1001) {
            this._socket.end();
            this._reset();
            return;
        }
        Logger.info("Received close frame", { code: closeCode, reason: closeReason });
        let serverResponse = "Sorry to see you go. Please open up a new connection.";
        this._sendClose(closeCode, serverResponse);
    }

    startHeartbeat() {
        this._isAlive = true;
        this._heartbeatTimer = setInterval(() => {
            if (this._isAlive === false) {
                Logger.info("Client missed HeartBeat response. Closing connection...");
                return this._socket.destroy();
            }

            this._isAlive = false;
            this._sendPing();
        }, 30000);
    }

    stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    _sendPing() {
        const firstByte = 0x89;
        const secondByte = 0x00;
        this._socket.write(Buffer.from([firstByte, secondByte]));
    }

    _sendPong(payloadBuffer) {
        const len = payloadBuffer ? payloadBuffer.length : 0;
        const firstByte = 0x8A;
        const secondByte = len;
        const header = Buffer.from([firstByte, secondByte]);
        const frame = len > 0 ? Buffer.concat([header, payloadBuffer]) : header;

        this._socket.write(frame);
        this._reset();
    }

}

module.exports = { http_server, WebSocketReceiver };
