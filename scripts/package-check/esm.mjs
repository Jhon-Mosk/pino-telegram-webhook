import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import createTransport, {
  sendMsgToTg,
  TelegramApiError,
} from 'pino-telegram-webhook';

assert.equal(typeof createTransport, 'function');
assert.equal(typeof sendMsgToTg, 'function');
assert.equal(new TelegramApiError('x').name, 'TelegramApiError');

const require = createRequire(import.meta.url);
assert.equal(
  require('pino-telegram-webhook/package.json').name,
  'pino-telegram-webhook',
);
assert.throws(() => require.resolve('pino-telegram-webhook/index.js'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});

console.log('esm: ok');
