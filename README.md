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

- `chatId`: The chat ID of the Telegram channel or group (a number), or the username of a channel (`'@channelusername'`). Required.
- `botToken`: The bot token of the Telegram bot. Required.
- `verbose`: Whether to display the log in verbose mode.
- `messageKey`: The key of the log message. Default is `msg`. Required if the logger's [message key](https://github.com/pinojs/pino/blob/HEAD/docs/api.md#messagekey-string) has been changed.
- `apiUrl`: Telegram Bot API URL. Default is `https://api.telegram.org`. Use this to send requests through your own reverse proxy.
- `extra`: Optional. Any parameters supported by the [sendMessage](https://core.telegram.org/bots/api#sendmessage) method, e.g. `parse_mode`, `disable_notification` or `message_thread_id` (to post to a forum topic).
- `timeout`: Request timeout in milliseconds. Default is `10000`. `0` disables it.
- `retries`: How many times to retry a message after a rate limit (`429`), a server error (`5xx`), a timeout or a network error. Default is `3`.
- `retryDelay`: Base delay in milliseconds for exponential backoff between retries. `429` responses wait for the `retry_after` returned by Telegram instead. Default is `1000`.
- `maxQueueSize`: Maximum number of messages waiting to be sent. Default is `1000`.
- `closeTimeout`: How long in milliseconds to keep sending queued messages when the logger closes. Default is `8000`, because pino waits for a transport for at most 10 seconds. `Infinity` waits until the queue is sent, which only makes sense if you close the transport yourself and wait for it.

The transport throws a `TypeError` on creation if `chatId` or `botToken` is missing.

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

The JSON is escaped for the chosen `parse_mode`, so characters like `<`, `&` or `` ` `` in log records do not break the markup.

A record without a message (e.g. `logger.error({ userId: 1 })`) is sent as JSON, the same way as in verbose mode.

## Delivery

- Messages are sent one at a time and in order. Telegram allows about [one message per second per chat](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this), so parallel requests would only be rejected.
- Rate limits, server errors, timeouts and network errors are retried (see `retries`). Other errors, such as an invalid token, an unknown chat or invalid markup, are not retried.
- When the queue is full (see `maxQueueSize`), new messages are dropped. The number of dropped messages is written to stderr.
- Messages longer than Telegram's limit of 4096 characters are truncated and end with `…(truncated)`. In verbose mode the JSON is truncated before it is wrapped in a code block, so the markup stays valid. With `parse_mode` and your own markup in a message, truncation can cut a tag, and Telegram rejects such a message.
- Errors that are not retried, or remain after all retries, are written to stderr with the `pino-telegram-webhook:` prefix. They are written synchronously, so they are not lost when the process exits.
- When the logger is closed, the transport keeps sending the queue for up to `closeTimeout`. A retry that would not happen in time, for example after a `429` with `retry_after: 40`, is not waited for: the remaining messages are reported to stderr as not sent, so the process exits on time and you know what was lost.

## Sending messages directly

`sendMsgToTg` sends a single message without the transport. On failure it throws a `TelegramApiError` with `status` (HTTP status), `errorCode` and `parameters` from the Telegram response.

```js
import { sendMsgToTg, TelegramApiError } from 'pino-telegram-webhook';

try {
  await sendMsgToTg(chatId, botToken, 'Hello', { parse_mode: 'HTML' }, undefined, {
    timeout: 5000,
  });
} catch (error) {
  if (error instanceof TelegramApiError && error.status === 429) {
    console.log(`Retry after ${error.parameters.retry_after} s`);
  }
}
```

## TypeScript

Type definitions are included. `TransportOptions` describes the transport options:

```ts
import pino from 'pino';
import type { TransportOptions } from 'pino-telegram-webhook';

const options: TransportOptions = {
  chatId: -1234567890,
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
};

const logger = pino({
  transport: { target: 'pino-telegram-webhook', level: 'error', options },
});
```
