const http = require('http');
const CONSTANTS = require('./config/constants');
const UTILITIES = require('./utilities/utilities');

// defining our looping engine variables
const GET_INFO = 1;
const GET_LENGTH = 2; 
const GET_MASK_KEY = 3; 
const GET_PAYLOAD = 4; 
const SEND_ECHO = 5;  
const GET_CLOSE_INFO = 6; 

// server object creation
const http_server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Hello World!');
});

// starting server
http_server.listen(CONSTANTS.PORT, () => {
    console.log("The http server is listening on port " + CONSTANTS.PORT);
});

// basically we are registering callback with every possible error we will be facing 
CONSTANTS.CUSTOM_ERRORS.forEach(errorEvent => {
    process.on(errorEvent, (err) => {
        console.log('the code caught an error event: ' + errorEvent);
        console.log(err);
        process.exit(1);
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
    };
});

function upgradeConnection(req, socket, head) {
    const clientKey = req.headers['sec-websocket-key'];
    const headers   = UTILITIES.createUpgradeHeaders(clientKey);
    socket.write(headers);
    startWebSocketConnection(socket);
}

function startWebSocketConnection(socket){
    console.log(`WS CONNECTION ESTABLISHED WITH CLIENT PORT: ${socket.remotePort}`);
    const receiver = new WebSocketReceiver(socket);

    socket.on('data', (chunk) => {
        receiver.processBuffer(chunk);
    })

    socket.on('end', () => {
        console.log('Closing Connection...');
    });
}

class WebSocketReceiver {

    constructor(socket){
        this._socket = socket;
    }

    // define properties 
    _buffersArray = [];
    _bufferedBytesLength = 0;
    _taskLoop = false; 
    _task = GET_INFO;
    _fin = false; // Indicates if the final fragment of a message has been received.
    _opcode = null; // Opcode representing the type of received data.
    _masked = false; // Indicates whether the received frame is masked.
    _initialPayloadSizeIndicator = 0; // Size indicator for the payload being processed.
    _framePayloadLength = 0; // length of one WebSocket frame received
    _maxPayload = 1024 * 1024; // this value is 1 megabyte (MiB) in size
    _totalPayloadLength = 0; 
    _mask = Buffer.alloc(CONSTANTS.MASK_LENGTH); // this will hold the masking key set and sent by the client
    _framesReceived = 0; // tally of how many frames have been received related to our websocket message
    _fragments = []; // store fragments (frames) for reassembly 

    processBuffer(chunk) {
        this._buffersArray.push(chunk);
        this._bufferedBytesLength += chunk.length;

        console.log("Chunk received of size : " + chunk.length);
        this._startTaskLoop();
    }

    _startTaskLoop() {
        this._taskLoop = true;

        do {
            switch(this._task){
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
        }while(this._taskLoop); 
    }   
    
    _getInfo(){
        if(this._bufferedBytesLength < CONSTANTS.MIN_FRAME_SIZE){
            this._taskLoop = false;
            return;
        }

        const infoBuffer = this._consumeHeaders(CONSTANTS.MIN_FRAME_SIZE);
        const firstByte  = infoBuffer[0];
        const secondByte = infoBuffer[1];

        this._fin = (firstByte & 0b10000000) === 0b10000000;
        this._opcode = (firstByte & 0b00001111);
        this._masked = (secondByte & 0b10000000) === 0b10000000;
        this._initialPayloadSizeIndicator = secondByte & 0b01111111;    
        
        if(!this._masked) {
            // end the socket connection and send a close frame
            this._sendClose(1002, "MASK must be set.");
        };

        // **** PING AND PONG FRAMES
        if([CONSTANTS.OPCODE_PING, CONSTANTS.OPCODE_PONG].includes(this._opcode)) {
            // send a close frame and close the underlying WS connection
            this._sendClose(1003, "The server does not accept ping or pong frames."); // unsupported data
        };

        this._task = GET_LENGTH;
    } // *end Get Info

    _getLength(){
        // extract the length of the WS frame payload (or fragment)
        switch(this._initialPayloadSizeIndicator){
            case CONSTANTS.MEDIUM_DATA_FLAG:
                let mediumPayloadLengthBuffer = this._consumeHeaders(CONSTANTS.MEDIUM_SIZE_CONSUMPTION);
                this._framePayloadLength = mediumPayloadLengthBuffer.readUInt16BE(),
                this._processLength();
                break;
            case CONSTANTS.LARGE_DATA_FLAG:
                let largePayloadLengthBuffer = this._consumeHeaders(CONSTANTS.LARGE_SIZE_CONSUMPTION);
                let bufBigInt = largePayloadLengthBuffer.readBigUInt64BE(); // returns a Big Int number
                this._framePayloadLength = Number(bufBigInt); // convert Big Int into a normal number
                this._processLength();
                break;
            default:
                this._framePayloadLength = this._initialPayloadSizeIndicator;
                this._processLength();
        };  
    }; // *end getLength

    _processLength(){
        this._totalPayloadLength += this._framePayloadLength;
        
        if(this._totalPayloadLength > this._maxPayload){
            this._sendClose(1009, "The WS server does not support such huge message lengths.");
        }

        this._task = GET_MASK_KEY;
    } // *end processLength

    _getMaskKey(){
        this._mask = this._consumeHeaders(CONSTANTS.MASK_LENGTH);
        // to extract our payload data
        this._task = GET_PAYLOAD;
    } // *end getMaskKey

    _getPayload(){
        if(this._bufferedBytesLength < this._framePayloadLength){
            this._taskLoop = false;
            return;
        }

        this._framesReceived++;

        let frame_masked_payload_buffer = this._consumePayload(this._framePayloadLength);
        let frame_unmasked_payload_buffer = UTILITIES._unmaskPayload(frame_masked_payload_buffer, this._mask);
        
         // push decoded / unmasked data into our fragments array
        if(frame_unmasked_payload_buffer.length) {
            this._fragments.push(frame_unmasked_payload_buffer);
        };

        // **** CLOSE FRAME WITH A PAYLOAD
        if(this._opcode === CONSTANTS.OPCODE_CLOSE) {
            this._task = GET_CLOSE_INFO;
            return;
        };

        if(this._framePayloadLength <= 0) {
            this._sendClose(1008, "The text area can't be empty.");
            return;
        };

        if (!this._fin) {
            // FIN:0, loop and wait to get aditional fragments
            this._task = GET_INFO;
        } else {
            // FIN: 1 - SEND DATA BACK TO THE CLIENT
            console.log("TOTAL FRAMES RECEIVED IN THIS WS MESSAGE: " + this._framesReceived);
            console.log("TOTAL PAYLOAD SIZE OF THE WS MESSAGE IS: " + this._totalPayloadLength);
            this._task = SEND_ECHO;
        };

    } // *end getPayload

    _consumePayload(n) {
        this._bufferedBytesLength -= n;

        const payloadBuffer = Buffer.alloc(n);
        let totalBytesRead = 0;

        while(totalBytesRead < n){
            const buf = this._buffersArray[0];
            const bytesToRead = Math.min(n - totalBytesRead, buf.length);

            buf.copy(payloadBuffer, totalBytesRead, 0, bytesToRead);
            totalBytesRead += bytesToRead;

            if(bytesToRead < buf.length){
                this._buffersArray[0] = buf.slice(bytesToRead);
            }else{
                this._buffersArray.shift();
            }
        }

        return payloadBuffer;
    } // *end consumePayload

    _consumeHeaders(size){
        this._bufferedBytesLength -= size;

        if(size === this._buffersArray[0].length){
            return this._buffersArray.shift();
        };

        if(size < this._buffersArray[0].length){
            const infoBuffer = this._buffersArray[0];
            this._buffersArray[0] = this._buffersArray[0].slice(size);
            return infoBuffer.slice(0, size);
        }else {
            // n is > buffersArray[0]
            throw Error('You cannot extract more data from a ws frame than the actual frame size.');
        };
    } // *end Consume Headers

    _reset() {
        this._buffersArray = [];                // array containing the chunks of data received
        this._bufferedBytesLength = 0;          // a number, keep track of the total bytes in our custom buffer after each chunck of data is recevied
        this._taskLoop = false; 
        this._task = GET_INFO;
        this._fin = false;                      // Indicates if the final fragment of a message has been received.
        this._opcode = null;                    // Opcode representing the type of received data.
        this._masked = false;                   // Indicates whether the received frame is masked.
        this._initialPayloadSizeIndicator = 0;  // Size indicator for the payload being processed.
        this._framePayloadLength = 0;           // length of one WebSocket frame received
        this._totalPayloadLength = 0; 
        this._mask = Buffer.alloc(CONSTANTS.MASK_LENGTH); // this will hold the masking key set and sent by the client
        this._framesReceived = 0;               // tally of how many frames have been received related to our websocket message
        this._fragments = [];                   // store fragments (frames) for reassembly 
    }; // *end reset
    

    _sendClose(closeCode, closeReason) {
        // extract and/or construct the closure code & reason
        let closureCode = (typeof closeCode !== 'undefined' && closeCode) ? closeCode : 1000; // insert more complicated logic in your application
        let closureReason = (typeof closeReason !== 'undefined' && closeReason) ? closeReason : "";

        // get the length of the binary representation of our reason
        const closureReasonBuffer = Buffer.from(closureReason, 'utf8');
        const closureReasonLength = closureReasonBuffer.length; 

        // construct the close frame payload (mandatory 2 byte closure code, + payload)
        const closeFramePayload = Buffer.alloc(2 + closureReasonLength);
        // write the close code into the payload
        closeFramePayload.writeInt16BE(closureCode, 0); // closure status code, starting at the beginning of our payload buffer
        closureReasonBuffer.copy(closeFramePayload, 2);

        // final step: create the first byte and second byte, and then create the final frame to send back the client
        const firstByte = 0b10000000 | 0b00000000 | 0b00001000; // FIN (1) + RSV (0) + OPCODE (8)
        const secondByte = closeFramePayload.length;
        const mandatoryCloseHeaders = Buffer.from([firstByte, secondByte]);

        // now create the final close frame
        const closeFrame = Buffer.concat([mandatoryCloseHeaders, closeFramePayload]);

        // send the close frame, and reset the receiver properties
        this._socket.write(closeFrame);
        this._socket.end(); // ending the TCP websocket connection in compliance with the RFC

        // reset
        this._reset();

    }; // *end sendClose

    _sendEcho() {
        // **** TASK 1: CONSTRUCT AN EMPTY FRAME WITH CORRECT SIZE ****
        // extract our entire message (could consist of numerous frames) from our persistent _fragments array, and create ONE buffer with the entire message
        const fullMessage = Buffer.concat(this._fragments); // this is the actual 'payload' of our WS frame

        // extract the payload length
        let payloadLength = fullMessage.length; 
        // initiate the additional payload size indicator variable (result will either be 0, 2, 8);
        let additionalPayloadSizeIndicator = null; 

        // determine the additional bytes required to represent the payload size
        switch (true) {
            case (payloadLength <= CONSTANTS.SMALL_DATA_SIZE):
                additionalPayloadSizeIndicator = 0; // all payload size info is displayed in the initial 7 bits contained in the second byte
                break;
            case (payloadLength > CONSTANTS.SMALL_DATA_SIZE && payloadLength <= CONSTANTS.MEDIUM_DATA_SIZE): 
                additionalPayloadSizeIndicator = CONSTANTS.MEDIUM_SIZE_CONSUMPTION;
                break; 
            default:
                additionalPayloadSizeIndicator = CONSTANTS.LARGE_SIZE_CONSUMPTION; 
        };

        // mini-mission is complete: create an empty binary frame with the correct size
        const frame = Buffer.alloc(CONSTANTS.MIN_FRAME_SIZE + additionalPayloadSizeIndicator + payloadLength);
        
        // *** task 2: populate the frame with all header info
        // 1️ first byte
        let fin = 0x01; // 0b00000001
        let rsv1 = 0x00;
        let rsv2 = 0x00;
        let rsv3 = 0x00;
        let opcode = CONSTANTS.OPCODE_BINARY; 
        // shift biwise operator - shift all bits to their correct positions
        let firstByte = (fin << 7) | (rsv1 << 6) | (rsv2 << 5) | (rsv3 << 4) | opcode;
        frame[0] = firstByte; // FIN, RSV, + OPCODE

        // 2️ populate our frame with the payload length 
        // set masking bit (0 for server to client)
        let maskingBit = 0x00; // 0b00000000 or 0 in decimal

        if(payloadLength <= CONSTANTS.SMALL_DATA_SIZE) {
            // set the second byte to indicate the actual payload
            frame[1] = (maskingBit | payloadLength);
        } else if (payloadLength <= CONSTANTS.MEDIUM_DATA_SIZE) {
            // task 1: populate the second byte in the frame header
            frame[1] = (maskingBit | CONSTANTS.MEDIUM_DATA_FLAG); // 0b01111110;
            // task 2: populate the remaining 2 bytes with the payload size
            frame.writeUInt16BE(payloadLength, CONSTANTS.MIN_FRAME_SIZE); 
        } else {
            // task 1: populate the second byte in the frame header
            frame[1] = (maskingBit | CONSTANTS.LARGE_DATA_FLAG); // 0b01111111;
            // task 2: populate the remaining 8 bytes with the payload size
            frame.writeBigInt64BE(BigInt(payloadLength), CONSTANTS.MIN_FRAME_SIZE);
        };

        // task 3: add payload to the frame
        // copy our message into the frame buffer
        const messageStartOffset = CONSTANTS.MIN_FRAME_SIZE + additionalPayloadSizeIndicator;
        fullMessage.copy(frame, messageStartOffset);

        // send the frame to the client and reset all values
        this._socket.write(frame);
        this._reset();
    }; // *end sendEcho

    _getCloseInfo() {
        let closeFramePayload = this._fragments[0]; // control frames cannot be fragmented. So we know that only one fragment exists in our array that contains our entire closure body data
        if(!closeFramePayload) {
            this._sendClose(1008, "Next time, pls set the status code.");
            return;
        };  
        // extract the close code from the first 2 bytes of the payload
        let closeCode = closeFramePayload.readUInt16BE(); // reads the first 2 bytes of our buffer
        let closeReason = closeFramePayload.toString('utf8', 2); // reads the remaining bytes as a UTF-8 string, starting from index 2
        if(closeCode === 1001) {
            this._socket.end();
            this._reset();
            return;
        };
        console.log(`Received close frame with code: ${closeCode} and reason: ${closeReason}`);
        // prepare a server response / comment to send back 
        let serverResponse = "Sorry to see you go. Please open up a new connection.";
        // send a closure frame with the close code and reason
        this._sendClose(closeCode, serverResponse);
    }; //*end getCloseInfo

}
