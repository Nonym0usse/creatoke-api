const pino = require('pino');
const path = require('path');
const os = require('os');

const baseLogsDir = process.env.CPANEL_LOG_DIR 
  || path.join(os.homedir() || __dirname, 'logs');

const logFilePath = path.join(baseLogsDir, 'app.log');

const transport = pino.transport({
  targets: [
    { target: 'pino/file', options: { destination: logFilePath, mkdir: true } },
    { target: 'pino-pretty', options: { colorize: true }, level: 'debug' },
  ],
});

const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, transport);

module.exports = logger;