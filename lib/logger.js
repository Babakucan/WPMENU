const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error.log');
const LOG_ALL = path.join(LOG_DIR, 'app.log');

function ensureDir() {
  if (!fs.existsSync(path.join(__dirname, '..', 'data'))) fs.mkdirSync(path.join(__dirname, '..', 'data'));
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function formatLine(level, msg, meta) {
  const reqId = meta && meta.requestId ? ` [${meta.requestId}]` : '';
  return `[${timestamp()}] [${level}]${reqId} ${msg}`;
}

function writeLog(level, msg, errOrMeta) {
  ensureDir();
  const err = errOrMeta instanceof Error ? errOrMeta : null;
  const meta = errOrMeta && !(errOrMeta instanceof Error) ? errOrMeta : {};
  const line = formatLine(level, msg, meta) + (err ? '\n' + (err.stack || err) : '') + '\n';
  if (level === 'error') fs.appendFileSync(LOG_FILE, line);
  else fs.appendFileSync(LOG_ALL, line);
}

function logError(msg, err) {
  writeLog('error', msg, err);
}

function logWarn(msg, meta) {
  writeLog('warn', msg, meta);
}

function logInfo(msg, meta) {
  writeLog('info', msg, meta);
}

module.exports = { logError, logWarn, logInfo, ensureDir };
