const pino = require('pino');
const path = require('path');

// Log file dans ton dossier /logs de cPanel (écriture autorisée)
const logFilePath = path.join(process.env.HOME || __dirname, 'logs', 'app.log');

// Destination du log : fichier + stdout
const transport = pino.transport({
  targets: [
    { target: 'pino/file', options: { destination: logFilePath, mkdir: true } },
    { target: 'pino-pretty', options: { colorize: true }, level: 'debug' },
  ],
});

const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, transport);

module.exports = logger;