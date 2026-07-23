// 🥅 (1) grab the incoming HTTP request data (2) calculate the server Sec-WebSocket-Accept value, and (3) send back appropriate headers to estalibsh a valid WS connection

// 🔴 *** HTTP SERVER ***
// use Node's inbuilt native 'http' module (you can use others like 'net' module)
const HTTP = require('http');

// import our custom libraries
const CONSTANTS = require('./custom_lib/websocket_constants');
const FUNCTIONS = require('./custom_lib/websocket_methods');

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

function startWebSocketConnection(socket) {
    
};


