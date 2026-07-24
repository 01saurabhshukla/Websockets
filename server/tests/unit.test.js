const { test, describe } = require('node:test');
const assert = require('node:assert');
const UTILITIES = require('../utilities/utilities');
const CONSTANTS = require('../config/constants');

describe('WebSocket Upgrade Unit Tests', () => {

    describe('isOriginAllowed()', () => {
        test('should allow valid origins specified in constants', () => {
            assert.strictEqual(UTILITIES.isOriginAllowed('http://127.0.0.1:8000'), true);
            assert.strictEqual(UTILITIES.isOriginAllowed('http://localhost:5500'), true);
            assert.strictEqual(UTILITIES.isOriginAllowed('null'), true);
        });

        test('should reject unauthorized origins', () => {
            assert.strictEqual(UTILITIES.isOriginAllowed('http://malicious-site.com'), false);
            assert.strictEqual(UTILITIES.isOriginAllowed('http://evil.org'), false);
        });
    });

    describe('generateServerKey() - RFC 6455 Spec Test Vector', () => {
        test('should correctly calculate Sec-WebSocket-Accept according to RFC 6455 Section 1.3', () => {
            // Official example from RFC 6455 Specification
            const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
            const expectedServerKey = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';

            const actualServerKey = UTILITIES.generateServerKey(clientKey);
            assert.strictEqual(actualServerKey, expectedServerKey);
        });
    });

    describe('createUpgradeHeaders()', () => {
        test('should construct valid HTTP 101 Switching Protocols header block', () => {
            const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
            const headers = UTILITIES.createUpgradeHeaders(clientKey);

            assert.ok(headers.includes('HTTP/1.1 101 Switching Protocols'));
            assert.ok(headers.includes('Upgrade: websocket'));
            assert.ok(headers.includes('Connection: Upgrade'));
            assert.ok(headers.includes('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo='));
            assert.ok(headers.endsWith('\r\n\r\n'), 'Headers must terminate with double CRLF (\\r\\n\\r\\n)');
        });
    });

    describe('check() utility validation', () => {
        test('should return true when all checks pass', () => {
            const mockSocket = { write: () => {}, end: () => {} };
            const isValid = UTILITIES.check(mockSocket, true, true, true, true);
            assert.strictEqual(isValid, true);
        });

        test('should write HTTP 400 Bad Request and close socket when validation fails', () => {
            let writtenData = '';
            let isSocketEnded = false;

            const mockSocket = {
                write: (data) => { writtenData += data; },
                end: () => { isSocketEnded = true; }
            };

            const isValid = UTILITIES.check(mockSocket, true, false, true, true);
            assert.strictEqual(isValid, undefined);
            assert.ok(writtenData.includes('HTTP/1.1 400 Bad Request'));
            assert.ok(writtenData.includes('RFC6455 spec'));
            assert.strictEqual(isSocketEnded, true);
        });
    });

});
