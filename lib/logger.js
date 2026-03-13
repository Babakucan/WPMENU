const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error.log');

function ensureDir() {
  if (!fs.existsSync(path.join(__dirname, '..', 'data'))) fs.mkdirSync(path.join(__dirname, '..', 'data'));
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function logError(msg, err) {
  ensureDir();
  const line = `[${timestamp()}] ${msg}${err ? '\n' + (err.stack || err) : ''}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

module.exports = { logError, ensureDir };
