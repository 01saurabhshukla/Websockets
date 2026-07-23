// 🥅 (1) construct an empty frame with the correct size (2) populate the frame with all the header information (3) add the actual payload to the frame

// 🔴 *** HTTP SERVER ***
// use Node's inbuilt native 'http' module (you can use others like 'net' module)
const HTTP = require('http');

// import our custom libraries
const CONSTANTS = require('./custom_lib/websocket_constants');
const FUNCTIONS = require('./custom_lib/websocket_methods');

// defining our looping engine variables
const GET_INFO = 1;
const GET_LENGTH = 2; 
const GET_MASK_KEY = 3; 
const GET_PAYLOAD = 4; 
const SEND_ECHO = 5;  

// create a HTTP web-server object
const HTTP_SERVER = HTTP.createServer((req, res) => {
    // for a request to ws://, the following code inside of here will NOT be executed. Instead, the request will be passed onto the upgrade event listener - if there is no 'ugrade' event listener, an error will be thrown
    res.writeHead(200);
    res.end('Hello, I hope you enjoy the "under-the-hood" WebSocket implementation');
});

// HTTP => start the http server
HTTP_SERVER.listen(CONSTANTS.PORT, () => {
    console.log("The http server is listening on port " + CONSTANTS.PORT);
});

// ERROR HANDLING
CONSTANTS.CUSTOM_ERRORS.forEach( errorEvent => {
    process.on(errorEvent, (err) => {
        console.log(`My code caught an error event: ${errorEvent}. Here's the error object`, err);
        // exit the process.
        process.exit(1);
    });
});

HTTP_SERVER.on('upgrade', (req, socket, head) => {
    // grab the required request headers
    const upgradeHeaderCheck = req.headers['upgrade'].toLowerCase() === CONSTANTS.UPGRADE;
    const connectionHeaderCheck = req.headers['connection'].toLowerCase() === CONSTANTS.CONNECTION;
    const methodCheck = req.method === CONSTANTS.METHOD;

    // check the origin
    const origin = req.headers['origin'];
    const originCheck = FUNCTIONS.isOriginAllowed(origin);

    // perform a final check that all request headers are okay, and only then do I want to handle the upgrade request from the server side
    if (FUNCTIONS.check(socket, upgradeHeaderCheck, connectionHeaderCheck, methodCheck, originCheck)) {
        upgradeConnection(req, socket, head);
    };
});

function upgradeConnection(req, socket, head) {
    // grab the client key
    const clientKey = req.headers['sec-websocket-key'];
    // generate response headers
    const headers = FUNCTIONS.createUpgradeHeaders(clientKey);
    socket.write(headers);
    // 🎉🙌 if successful, you now have a valid websocket connection
    startWebSocketConnection(socket);
};

// 🟢 *** WEBSOCKET SERVER LOGIC
// code below will relate to our custom websocket server

function startWebSocketConnection(socket) {
    // provide some feedback to the terminal that there is a WS connection
    console.log(`WS CONNECTION ESTABLISHED WITH CLIENT PORT: ${socket.remotePort}`);

    // create a receiver object
    // one instance of this receiver should handle all incoming data
    const receiver = new WebSocketReceiver(socket);

    // listen for the data event
    socket.on('data', (chunk) => {
        receiver.processBuffer(chunk);
    });

    socket.on('end', () => {
        console.log("there will be no more data. The WS connection is closed.")
    });
};

class WebSocketReceiver {
    // grab the socket and assign it to the object
    constructor(socket) {
        this._socket = socket; 
    };

    // **** define starting properties
    _buffersArray = []; // array containing the chunks of data received
    _bufferedBytesLength = 0; // a number, keep track of the total bytes in our custom buffer after each chunck of data is recevied
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

    // **** define methods
    // process the incoming buffer chunck
    processBuffer(chunk) {
        this._buffersArray.push(chunk); // push chuncks into _buffersArray 
        this._bufferedBytesLength += chunk.length; // this is a running tally of how many bytes are in our custom internal buffer 
        // start performing tasks
        console.log("Chunk received of size: " + chunk.length);
        this._startTaskLoop(); 
    };

    // loop management system
    _startTaskLoop() {
        this._taskLoop = true; // we want to create a loop to copmlete numerous tasks, and also eventually to deal with fragmented data. Eventually we will have to set this taskLoop to false when we are done processing the data

        do {
            switch(this._task) {
                case GET_INFO:
                    this._getInfo(); // first step is to get information about the WS data received (WS binary frame format); 
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
            }
        } while (this._taskLoop);

    }; // *end task loop management function 

    _getInfo() {
        // check whether we have enough bytes in our internal buffer to process at the very least frame header information 
        if(this._bufferedBytesLength < CONSTANTS.MIN_FRAME_SIZE) {
            // wait for additional chunks via the 'data' event on our socket object
            this._taskLoop = false; 
            return; 
        };

        const infoBuffer = this._consumeHeaders(CONSTANTS.MIN_FRAME_SIZE);
        const firstByte = infoBuffer[0];
        const secondByte = infoBuffer[1];

        // extract WS payload information
        this._fin = (firstByte & 0b10000000) === 0b10000000; // FIN bit (0x80 hex) 
        this._opcode = firstByte & 0b00001111; // Opcode (0x0F hex)
        this._masked = (secondByte & 0b10000000) === 0b10000000; // Masked bit (0x80 hex)
        this._initialPayloadSizeIndicator = secondByte & 0b01111111; // Payload length (0x7F hex)

        // if data is not this._masked, then throw an error
        if(!this._masked) {
            // send a CLOSE frame back to the client (later in the course)
            throw new Error("Mask is not set by the client.");
        };

        // next, get the length of our actual payload
        this._task = GET_LENGTH;

    }; // *end getInfo

    _consumeHeaders(n) {
        // reduce our bufferedBytesLength by how many bytes we will consume
        this._bufferedBytesLength -= n; // goal is to have this get to 0

        // if our extraction is the same size as the actual buffer, return the entire buffer and at the same time remove the entire first element from our buffersArray 
        if (n === this._buffersArray[0].length) {
            return this._buffersArray.shift();
        };

        if (n < this._buffersArray[0].length) {
            // create a temporary info buffer from the _buffersArray
            const infoBuffer = this._buffersArray[0];
            // remove consumed bytes from our _buffersArray
            this._buffersArray[0] = this._buffersArray[0].slice(n);
            // return our temporary infoBuffer
            return infoBuffer.slice(0, n);
        } else {
            // n is > buffersArray[0]
            throw Error('You cannot extract more data from a ws frame than the actual frame size.');
        };

    }; // *end consumeHeaders

    _getLength() {
        // extract the length of the WS frame payload (or fragment)
        switch (this._initialPayloadSizeIndicator) {
            case CONSTANTS.MEDIUM_DATA_FLAG:
                let mediumPayloadLengthBuffer = this._consumeHeaders(CONSTANTS.MEDIUM_SIZE_CONSUMPTION);
                this._framePayloadLength = mediumPayloadLengthBuffer.readUInt16BE();
                this._processLength();
                break;
            case CONSTANTS.LARGE_DATA_FLAG:
                let largePayloadLengthBuffer = this._consumeHeaders(CONSTANTS.LARGE_SIZE_CONSUMPTION);
                let bufBigInt = largePayloadLengthBuffer.readBigUInt64BE(); // returns a Big Int number
                this._framePayloadLength = Number(bufBigInt); // convert Big Int into a normal number
                this._processLength();
                break;
            default:
                // if the payload is <= 125 bytes, then we know that the WS initialPayloadSizeIndicator (7 bits) represents the actual payload length of the frame
                this._framePayloadLength = this._initialPayloadSizeIndicator;
                this._processLength();
        };
    }; // *end getLength

    _processLength() {
        this._totalPayloadLength += this._framePayloadLength;
        // throw error if user attempts to abuse our WS server
        if(this._totalPayloadLength > this._maxPayload) {
            // i want to later send a CLOSE Frame back to the client and terminate connection
            throw new Error("Data is too large");
        };

        // extracting the masking key
        this._task = GET_MASK_KEY;

    }; // *end processLength

    _getMaskKey() {
        this._mask = this._consumeHeaders(CONSTANTS.MASK_LENGTH);
        // to extract our payload data
        this._task = GET_PAYLOAD;
        
    }; // *end getMaskKey

    _getPayload() {
        // *** LOOP for the full frame payload
        // if we have not yet receied the entire payload, wait for another 'data' event fired on our socket object, in order to receive more data
        if(this._bufferedBytesLength < this._framePayloadLength) {
            // this._task is set to GET_PAYLOAD
            this._taskLoop = false; // so as new data arrives, code inside of getPayload() will execute
            return;
        };

        // FULL FRAME RECEIVED (there may be more frames if we have a fragmented message)
        this._framesReceived++; // increase counter by 1

        // consume the entire WS frame payload 
        let frame_masked_payload_buffer = this._consumePayload(this._framePayloadLength);

        // unmask the full data frame
        let frame_unmasked_payload_buffer = FUNCTIONS._unmaskPayload(frame_masked_payload_buffer, this._mask);

        // **** CLOSE FRAME
        if(this._opcode === CONSTANTS.OPCODE_CLOSE) {
            // later I want to define a closure function
            throw new Error("Server has not dealt with a closure frame ... yet");
        };

        // **** OTHER FRAMES
        if([CONSTANTS.OPCODE_BINARY, CONSTANTS.OPCODE_PING, CONSTANTS.OPCODE_PONG].includes(this._opcode)) {
            // later I want to define a closure function
            throw new Error("Server has not dealt with a this type of frame ... yet");
        };

        // **** TEXT FRAME
        // push decoded / unmasked data into our fragments array
        if(frame_unmasked_payload_buffer.length) {
            this._fragments.push(frame_unmasked_payload_buffer);
        };

        // CHECK IF MORE FRAMES (fragments) ARE REQUIRED
        // if fin is false, wait and process more data and get into to check its FIN state, OPCODE, etc.
        if (!this._fin) {
            // FIN:0, loop and wait to get aditional fragments
            this._task = GET_INFO;
        } else {
            // FIN: 1 - SEND DATA BACK TO THE CLIENT
            console.log("TOTAL FRAMES RECEIVED IN THIS WS MESSAGE: " + this._framesReceived);
            console.log("TOTAL PAYLOAD SIZE OF THE WS MESSAGE IS: " + this._totalPayloadLength);
            this._task = SEND_ECHO;
        };

    }; // *end getPayload

    _consumePayload(n) { 
        // reduce our bufferedBytesLength by how many bytes we will consume
        this._bufferedBytesLength -= n; 

        const payloadBuffer = Buffer.alloc(n); // creating a new buffer for data we are yet to put into it
        let totalBytesRead = 0; // keep track of the total number of bytes that have been read into the payloadBuffer

        // this loop will continue to read data into the payloadBuffer until all 'n' bytes have been read into it
        while(totalBytesRead < n) {
            const buf = this._buffersArray[0]; // retrieve the first chunk of data from an array of chunks
            const bytesToRead = Math.min(n - totalBytesRead, buf.length); // calculating the number of bytes to read from buf, ensuring that it does not eceed the reaminig bytes needed to reach n
            // read bytes into our payloadBuffer
            buf.copy(payloadBuffer, totalBytesRead, 0, bytesToRead); // copy data from our buf into payloadBuffer
            totalBytesRead += bytesToRead; // updating our bytes read counter

            // update our _buffersArray accordingly (either going to remove part of its first element, or the entire first element)
            if(bytesToRead < buf.length) {
                this._buffersArray[0] = buf.slice(bytesToRead);
            } else {
                this._buffersArray.shift(); // remove the entire first element in the array
            };
        };
        return payloadBuffer;
    }; // *end consumePayload

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
        // 1️⃣ first byte
        let fin = 0x01; // 0b00000001
        let rsv1 = 0x00;
        let rsv2 = 0x00;
        let rsv3 = 0x00;
        let opcode = CONSTANTS.OPCODE_BINARY; 
        // shift biwise operator - shift all bits to their correct positions
        let firstByte = (fin << 7) | (rsv1 << 6) | (rsv2 << 5) | (rsv3 << 4) | opcode;
        frame[0] = firstByte; // FIN, RSV, + OPCODE

        // 2️⃣ populate our frame with the payload length 
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
        this.reset();
    }; // *end sendEcho

    reset() {
        this._buffersArray = []; // array containing the chunks of data received
        this._bufferedBytesLength = 0; // a number, keep track of the total bytes in our custom buffer after each chunck of data is recevied
        this._taskLoop = false; 
        this._task = GET_INFO;
        this._fin = false; // Indicates if the final fragment of a message has been received.
        this._opcode = null; // Opcode representing the type of received data.
        this._masked = false; // Indicates whether the received frame is masked.
        this._initialPayloadSizeIndicator = 0; // Size indicator for the payload being processed.
        this._framePayloadLength = 0; // length of one WebSocket frame received
        this._totalPayloadLength = 0; 
        this._mask = Buffer.alloc(CONSTANTS.MASK_LENGTH); // this will hold the masking key set and sent by the client
        this._framesReceived = 0; // tally of how many frames have been received related to our websocket message
        this._fragments = []; // store fragments (frames) for reassembly 
    }; // *end reset

}; // *end RECEIVER


