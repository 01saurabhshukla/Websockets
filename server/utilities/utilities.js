const CONSTANTS = require('../config/constants');
const crypto = require('crypto');

// function isOriginAllowed(origin){
//     return CONSTANTS.ALLOWED_ORIGINS.includes(origin);
// }

function isOriginAllowed(origin){
    if (CONSTANTS.ALLOWED_ORIGINS.includes('*')) return true;
    return CONSTANTS.ALLOWED_ORIGINS.includes(origin);
}


function check(socket, upgradeHeaderCheck, connectionHeaderCheck, methodCheck, originCheck) {
    if(upgradeHeaderCheck && connectionHeaderCheck && methodCheck && originCheck) {
        return true;
    } else {
        const message = "400 bad request. The HTTP headers do not comply with the RFC6455 spec."; // custom server message sent back with HTTP response
        const messageLength = message.length; 
        const response = `HTTP/1.1 400 Bad Request\r\n` + // remember each header has to be end with a \r\n to comply with HTTP protocol rules
        `Content-Type: text/plain\r\n` +
        `Content-Length: ${messageLength}\r\n` + 
        `\r\n` +
        message;
        socket.write(response); // access our socket object, and send back a HTTP response
        socket.end(); // this will close the TCP connection and keep the server running
    };
};


function createUpgradeHeaders(clientKey) {
    let serverKey = generateServerKey(clientKey);
    let headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${serverKey}`
    ];
    const upgradeHeaders = headers.join('\r\n') + '\r\n\r\n'; // using the Array.join() method to add all of the required newlines
    return upgradeHeaders;
};

// generating the server accept key
function generateServerKey(clientKey) {
    // first step is to concat / join the client key with the GUID
    let data = clientKey + CONSTANTS.GUID;
    // second step is to hash the data
    const hash = crypto.createHash('sha1');
    hash.update(data);
    // final step is to digest the data into base64
    let serverKey = hash.digest('base64');
    return serverKey;
};

function _unmaskPayload(payloadBuffer, maskKey) {
    for (let i = 0; i < payloadBuffer.length; i++) {
        payloadBuffer[i] = payloadBuffer[i] ^ maskKey[i % CONSTANTS.MASK_LENGTH];
    };
    return payloadBuffer; 
};


module.exports = {
    isOriginAllowed,
    check,
    createUpgradeHeaders,
    generateServerKey,
    _unmaskPayload
}