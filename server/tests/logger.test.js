'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

/**
 * Logger tests.
 *
 * Strategy: intercept process.stdout.write and process.stderr.write so we can
 * capture what Logger outputs without actually printing to the terminal.
 * We restore the originals after every test.
 */

// Save originals so we can restore them after each test
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

describe('Logger', () => {

    let stdoutOutput = '';
    let stderrOutput = '';

    // Before each test: intercept writes and reset captured strings
    beforeEach(() => {
        stdoutOutput = '';
        stderrOutput = '';
        process.stdout.write = (str) => { stdoutOutput += str; return true; };
        process.stderr.write = (str) => { stderrOutput += str; return true; };

        // Reset LOG_LEVEL to INFO for every test so we start from a clean state
        process.env.LOG_LEVEL = 'DEBUG'; // set to DEBUG so all levels are visible in tests
    });

    // After each test: restore real stdout/stderr
    afterEach(() => {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    });

    // Helper: re-require Logger fresh so LOG_LEVEL changes take effect
    function freshLogger() {
        // Clear the module cache for Logger so it re-reads LOG_LEVEL
        delete require.cache[require.resolve('../logger/Logger')];
        return require('../logger/Logger');
    }

    // --- Output format ---

    describe('Output format', () => {

        test('Logger.info writes [INFO ] tag, timestamp, and message to stdout', () => {
            const Logger = freshLogger();
            Logger.info('hello world');

            assert.ok(stdoutOutput.includes('[INFO ]'), `Expected [INFO ] tag, got: ${stdoutOutput}`);
            assert.ok(stdoutOutput.includes('hello world'), 'Expected message in output');
            // Timestamp check — ISO 8601 format contains 'T' and 'Z'
            assert.match(stdoutOutput, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        test('Logger.debug writes [DEBUG] tag to stdout', () => {
            const Logger = freshLogger();
            Logger.debug('debug message');

            assert.ok(stdoutOutput.includes('[DEBUG]'), `Expected [DEBUG] tag, got: ${stdoutOutput}`);
            assert.ok(stdoutOutput.includes('debug message'));
        });

        test('Logger.warn writes [WARN ] tag to stderr (not stdout)', () => {
            const Logger = freshLogger();
            Logger.warn('something recoverable');

            assert.ok(stderrOutput.includes('[WARN ]'), `Expected [WARN ] tag in stderr, got: ${stderrOutput}`);
            assert.strictEqual(stdoutOutput, '', 'WARN should not write to stdout');
        });

        test('Logger.error writes [ERROR] tag to stderr (not stdout)', () => {
            const Logger = freshLogger();
            Logger.error('something broke');

            assert.ok(stderrOutput.includes('[ERROR]'), `Expected [ERROR] tag in stderr, got: ${stderrOutput}`);
            assert.strictEqual(stdoutOutput, '', 'ERROR should not write to stdout');
        });

    });

    // --- Context object ---

    describe('Context object', () => {

        test('appends JSON context after em dash when context is provided', () => {
            const Logger = freshLogger();
            Logger.info('connection opened', { port: 51423 });

            assert.ok(stdoutOutput.includes('—'), 'Expected em dash separator');
            assert.ok(stdoutOutput.includes('"port":51423'), `Expected context JSON, got: ${stdoutOutput}`);
        });

        test('does not append anything when context is omitted', () => {
            const Logger = freshLogger();
            Logger.info('no context here');

            assert.ok(!stdoutOutput.includes('—'), 'Should have no em dash when context is absent');
        });

        test('does not append anything when context is null', () => {
            const Logger = freshLogger();
            Logger.info('null context', null);

            assert.ok(!stdoutOutput.includes('—'), 'Should have no em dash for null context');
        });

    });

    // --- LOG_LEVEL filtering ---

    describe('LOG_LEVEL filtering', () => {

        test('does not emit DEBUG messages when LOG_LEVEL=INFO', () => {
            process.env.LOG_LEVEL = 'INFO';
            const Logger = freshLogger();
            Logger.debug('this should be silent');

            assert.strictEqual(stdoutOutput, '', 'DEBUG should be suppressed at INFO level');
        });

        test('does not emit INFO messages when LOG_LEVEL=WARN', () => {
            process.env.LOG_LEVEL = 'WARN';
            const Logger = freshLogger();
            Logger.info('this should be silent');

            assert.strictEqual(stdoutOutput, '', 'INFO should be suppressed at WARN level');
        });

        test('emits ERROR messages even at LOG_LEVEL=WARN', () => {
            process.env.LOG_LEVEL = 'WARN';
            const Logger = freshLogger();
            Logger.error('this should appear');

            assert.ok(stderrOutput.includes('[ERROR]'), 'ERROR should be emitted at WARN level');
        });

        test('emits all levels when LOG_LEVEL=DEBUG', () => {
            process.env.LOG_LEVEL = 'DEBUG';
            const Logger = freshLogger();
            Logger.debug('d');
            Logger.info('i');

            assert.ok(stdoutOutput.includes('[DEBUG]'), 'DEBUG should appear');
            assert.ok(stdoutOutput.includes('[INFO ]'), 'INFO should appear');
        });

    });

});
