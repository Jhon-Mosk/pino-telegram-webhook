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
      botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      apiUrl: 'https://api.telegram.org',
      extra: {
        parse_mode: 'HTML',
      },
    },
  },
});

logger.error('<b>test log!</b>');
```

## Options descriptions

- `chatId`: The chat ID of the Telegram channel or group. Required.
- `botToken`: The bot token of the Telegram bot. Required.
- `verbose`: Whether to display the log in verbose mode.
- `messageKey`: The key of the log message. Default is `msg`. Required if the logger's [message key](https://github.com/pinojs/pino/blob/HEAD/docs/api.md#messagekey-string) has been changed.
- `apiUrl`: Telegram Bot API URL. Default is `https://api.telegram.org`. Use this to send requests through your own reverse proxy.
- `extra` : The extra parameter is optional. Parameters that the method [sendMessage](https://core.telegram.org/bots/api#sendmessage) supports can be passed to it

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
