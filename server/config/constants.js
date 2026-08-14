
module.exports = {
    PORT: 4000,
    LOG_LEVEL: 'INFO', // 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

    FATAL_ERRORS: [
        'uncaughtException',
        'unhandledRejection'
    ],
    SHUTDOWN_SIGNALS: [
        'SIGINT',
        'SIGTERM'
    ],

    // Upgrade Constants
    METHOD: "GET",
    VERSION: 13,
    CONNECTION: "upgrade",
    UPGRADE: "websocket",
    ALLOWED_ORIGINS:
        process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [
            'http://127.0.0.1:8000',
            'http://localhost:8000',
        ]
    ,
    GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",

    // Frame Parsing
    MIN_FRAME_SIZE: 2,
    MASK_LENGTH: 4,

    SMALL_DATA_SIZE: 125,
    MEDIUM_DATA_SIZE: 65535,
    MEDIUM_DATA_FLAG: 126, // if payload header in WS frame (binary) is 01111110, or 126 (decimal), then the following 2 bytes represent the actual payload length
    LARGE_DATA_FLAG: 127, // if payload header in WS frame (binary) is 01111111, or 127 (decimal), then the following 8 bytes represent the actual payload length
    MEDIUM_SIZE_CONSUMPTION: 2,
    LARGE_SIZE_CONSUMPTION: 8,

    // *** WEBSOCKET OPCODES
    OPCODE_TEXT: 0x01, // text frame
    OPCODE_BINARY: 0x02, // binary frame
    OPCODE_CLOSE: 0x08, // closure frame
    OPCODE_PING: 0x09, // ping frame
    OPCODE_PONG: 0x0A, // pong frame

}