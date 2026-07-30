/**
 * Usage:
 *   Logger.info('Connection established', { port: 4000 });
 *   Logger.error('Frame parse failed', { reason: 'bad mask' });
 *
 * Output format:
 *   [LEVEL] [ISO_TIMESTAMP] message — {"key":"value"}
 */

const CONSTANTS = require('../config/constants');

const LEVELS = {
    DEBUG: 0,
    INFO:  1,
    WARN:  2,
    ERROR: 3,
};

const CONFIGURED_LEVEL = LEVELS[CONSTANTS.LOG_LEVEL] ?? LEVELS.INFO;


function _log(level, message, context) {
    if (LEVELS[level] < CONFIGURED_LEVEL) return;

    const timestamp = new Date().toISOString();
    const levelTag  = `[${level.padEnd(5)}]`; 

    let line = `${levelTag} ${timestamp} ${message}`;
    if (context !== undefined && context !== null) {
        line += ` — ${JSON.stringify(context)}`;
    }

    if (level === 'WARN' || level === 'ERROR') {
        process.stderr.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }
}

const Logger = {
    debug(message, context) { _log('DEBUG', message, context); },
    info(message, context)  { _log('INFO',  message, context); },
    warn(message, context)  { _log('WARN',  message, context); },
    error(message, context) { _log('ERROR', message, context); },
};

module.exports = Logger;
