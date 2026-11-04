// Loads the transport by name in a pino worker thread, as users do. The
// worker is unref'ed, so the process exits on its own after end().
import { once } from 'node:events';
import pino from 'pino';

const transport = pino.transport({
  target: 'pino-telegram-webhook',
  options: { chatId: -1, botToken: '1:fake' },
});
await once(transport, 'ready');
transport.end();

console.log('pino target: ok');
