const assert = require('node:assert/strict');
const transport = require('pino-telegram-webhook');

assert.equal(typeof transport.default, 'function');
assert.equal(typeof transport.sendMsgToTg, 'function');
assert.equal(new transport.TelegramApiError('x').name, 'TelegramApiError');

console.log('cjs: ok');
