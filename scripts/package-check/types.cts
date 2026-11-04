import transport = require('pino-telegram-webhook');

const stream = transport.default({ chatId: 1, botToken: 'token' });
stream.end();

const error = new transport.TelegramApiError('x', { status: 400 });
const status: number = error.status;
console.log(status);
