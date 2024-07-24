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

---

If `verbose = true`, the message will be displayed as
```
{
  "level": 50,
  "time": 1721832322878,
  "pid": 13522,
  "hostname": "fedora",
  "msg": "`inline fixed-width code`"
}
```

---

If `verbose = true` and `parse_mode = "HTML|Markdown|MarkdownV2`, the message will be displayed as
```json
{
  "level": 50,
  "time": 1721832322878,
  "pid": 13522,
  "hostname": "fedora",
  "msg": "`inline fixed-width code`"
}
```
