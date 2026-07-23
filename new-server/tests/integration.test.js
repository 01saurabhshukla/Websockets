const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const net = require('net');
const CONSTANTS = require('../config/constants');
const UTILITIES = require('../utilities/utilities');

describe('WebSocket Server Integration Tests', () => {
    let server;
    const TEST_PORT = 4005;

    before((_, done) => {
        server = http.createServer((req, res) => {
            res.writeHead(200);
            res.end('HTTP OK');
        });

        server.on('upgrade', (req, socket, head) => {
            const upgradeHeaderCheck = req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === CONSTANTS.UPGRADE;
            const connectionHeaderCheck = req.headers['connection'] && req.headers['connection'].toLowerCase() === CONSTANTS.CONNECTION;
            const methodCheck = req.method === CONSTANTS.METHOD;

            const origin = req.headers['origin'];
            const originCheck = UTILITIES.isOriginAllowed(origin);

            if (UTILITIES.check(socket, upgradeHeaderCheck, connectionHeaderCheck, methodCheck, originCheck)) {
                const clientKey = req.headers['sec-websocket-key'];
                const headers = UTILITIES.createUpgradeHeaders(clientKey);
                socket.write(headers);
            }
        });

        server.listen(TEST_PORT, () => {
            done();
        });
    });

    after((_, done) => {
        server.close(done);
    });

    test('Integration: Valid WebSocket Handshake returns 101 Switching Protocols', () => {
        return new Promise((resolve, reject) => {
            const clientSocket = net.createConnection({ port: TEST_PORT, host: '127.0.0.1' }, () => {
                const requestString =
                    'GET / HTTP/1.1\r\n' +
                    `Host: 127.0.0.1:${TEST_PORT}\r\n` +
                    'Upgrade: websocket\r\n' +
                    'Connection: Upgrade\r\n' +
                    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
                    'Sec-WebSocket-Version: 13\r\n' +
                    'Origin: http://127.0.0.1:8000\r\n\r\n';

                clientSocket.write(requestString);
            });

            let responseData = '';
            clientSocket.on('data', (chunk) => {
                responseData += chunk.toString();
                if (responseData.includes('\r\n\r\n')) {
                    try {
                        assert.ok(responseData.startsWith('HTTP/1.1 101 Switching Protocols'));
                        assert.ok(responseData.includes('Upgrade: websocket'));
                        assert.ok(responseData.includes('Connection: Upgrade'));
                        assert.ok(responseData.includes('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo='));
                        clientSocket.destroy();
                        resolve();
                    } catch (err) {
                        clientSocket.destroy();
                        reject(err);
                    }
                }
            });

            clientSocket.on('error', reject);
        });
    });

    test('Integration: Disallowed Origin returns 400 Bad Request and closes connection', () => {
        return new Promise((resolve, reject) => {
            const clientSocket = net.createConnection({ port: TEST_PORT, host: '127.0.0.1' }, () => {
                const requestString =
                    'GET / HTTP/1.1\r\n' +
                    `Host: 127.0.0.1:${TEST_PORT}\r\n` +
                    'Upgrade: websocket\r\n' +
                    'Connection: Upgrade\r\n' +
                    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
                    'Sec-WebSocket-Version: 13\r\n' +
                    'Origin: http://unauthorized-domain.com\r\n\r\n';

                clientSocket.write(requestString);
            });

            let responseData = '';
            clientSocket.on('data', (chunk) => {
                responseData += chunk.toString();
            });

            clientSocket.on('end', () => {
                try {
                    assert.ok(responseData.startsWith('HTTP/1.1 400 Bad Request'));
                    assert.ok(responseData.includes('RFC6455 spec'));
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            clientSocket.on('error', reject);
        });
    });

    test('Integration: Invalid HTTP Method (POST) returns 400 Bad Request', () => {
        return new Promise((resolve, reject) => {
            const clientSocket = net.createConnection({ port: TEST_PORT, host: '127.0.0.1' }, () => {
                const requestString =
                    'POST / HTTP/1.1\r\n' +
                    `Host: 127.0.0.1:${TEST_PORT}\r\n` +
                    'Upgrade: websocket\r\n' +
                    'Connection: Upgrade\r\n' +
                    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
                    'Sec-WebSocket-Version: 13\r\n' +
                    'Origin: http://127.0.0.1:8000\r\n\r\n';

                clientSocket.write(requestString);
            });

            let responseData = '';
            clientSocket.on('data', (chunk) => {
                responseData += chunk.toString();
            });

            clientSocket.on('end', () => {
                try {
                    assert.ok(responseData.startsWith('HTTP/1.1 400 Bad Request'));
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            clientSocket.on('error', reject);
        });
    });
});
