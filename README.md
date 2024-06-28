# pino-telegram-webhook

A [Pino v7+ transport](https://getpino.io/#/docs/transports?id=v7-transports) to send message to [Telegram](https://telegram.org/)

## Installation

```
npm install pino-telegram-webhook
```

## Usage

```js
const pino = require('pino');

const logger = pino({
  transport: {
    target: 'pino-telegram-webhook',
    level: 'error',
    options: {
      chatId: -1234567890,
      botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      extra: {
        parse_mode: "HTML",
      },
    },
  },
})

logger.error('<b>test log!</b>');
```

The extra parameter is optional. Parameters that the method [sendMessage](https://core.telegram.org/bots/api#sendmessage) supports can be passed to it
