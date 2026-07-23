// (1) create a HTTP web-server (2) implement basic error handling for our node process

// *** HTTP SERVER ***
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
    })
})


