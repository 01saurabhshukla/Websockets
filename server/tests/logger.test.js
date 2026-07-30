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

        // freshLogger(level) controls LOG_LEVEL per-test via constants mutation.
    });

    // After each test: restore real stdout/stderr
    afterEach(() => {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    });

    // Helper: re-require Logger fresh so LOG_LEVEL changes take effect.
    // Logger reads LOG_LEVEL from constants.js, so we must clear both
    // constants and Logger from the module cache before each re-require.
    function freshLogger(level) {
        const constants = require('../config/constants');
        constants.LOG_LEVEL = level || 'DEBUG'; // mutate the live object
        delete require.cache[require.resolve('../logger/Logger')];
        return require('../logger/Logger');
    }

    // --- Output format ---

    describe('Output format', () => {

        test('Logger.info writes [INFO ] tag, timestamp, and message to stdout', () => {
            const Logger = freshLogger('DEBUG');
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
            const Logger = freshLogger('INFO');
            Logger.debug('this should be silent');

            assert.strictEqual(stdoutOutput, '', 'DEBUG should be suppressed at INFO level');
        });

        test('does not emit INFO messages when LOG_LEVEL=WARN', () => {
            const Logger = freshLogger('WARN');
            Logger.info('this should be silent');

            assert.strictEqual(stdoutOutput, '', 'INFO should be suppressed at WARN level');
        });

        test('emits ERROR messages even at LOG_LEVEL=WARN', () => {
            const Logger = freshLogger('WARN');
            Logger.error('this should appear');

            assert.ok(stderrOutput.includes('[ERROR]'), 'ERROR should be emitted at WARN level');
        });

        test('emits all levels when LOG_LEVEL=DEBUG', () => {
            const Logger = freshLogger('DEBUG');
            Logger.debug('d');
            Logger.info('i');

            assert.ok(stdoutOutput.includes('[DEBUG]'), 'DEBUG should appear');
            assert.ok(stdoutOutput.includes('[INFO ]'), 'INFO should appear');
        });

    });

});
