# pino-telegram-webhook

[![npm version](https://img.shields.io/npm/v/pino-telegram-webhook)](https://www.npmjs.com/package/pino-telegram-webhook)
[![npm downloads](https://img.shields.io/npm/dm/pino-telegram-webhook)](https://www.npmjs.com/package/pino-telegram-webhook)
[![CI](https://github.com/Jhon-Mosk/pino-telegram-webhook/actions/workflows/ci.yml/badge.svg)](https://github.com/Jhon-Mosk/pino-telegram-webhook/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/pino-telegram-webhook)](https://github.com/Jhon-Mosk/pino-telegram-webhook/blob/main/LICENSE)

A [Pino v7+ transport](https://getpino.io/#/docs/transports?id=v7-transports)
that sends logs to [Telegram](https://telegram.org/) chats, groups, forum
topics and channels with the
[Bot API](https://core.telegram.org/bots/api#sendmessage).

## Features

- Runs in a pino worker thread, so sending logs does not block your app.
- Sends messages one at a time and in order, waits for `retry_after` on rate
  limits and retries server and network errors.
- Bounded queue and a time budget for shutdown: a burst of logs cannot eat
  memory, and a stuck request cannot keep the process from exiting.
- Verbose mode sends the whole log record as JSON, escaped for the chosen
  `parse_mode`.
- Long messages are truncated to Telegram's limit instead of being rejected.
- Works through a proxy or your own Bot API server.
- TypeScript definitions included. One dependency
  ([`pino-abstract-transport`](https://github.com/pinojs/pino-abstract-transport)).

## Requirements

- Node.js 22.12 or later.
- [pino](https://github.com/pinojs/pino) 7 or later.

## Installation

```sh
npm install pino pino-telegram-webhook
```

You need a bot token and a chat ID: see [FAQ](#faq).

## Usage

```js
import pino from 'pino';

const logger = pino({
  level: 'error',
  transport: {
    target: 'pino-telegram-webhook',
    options: {
      chatId: -1001234567890,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    },
  },
});

logger.error('Payment service is down');
```

The same works in CommonJS:

```js
const pino = require('pino');

const logger = pino({
  level: 'error',
  transport: {
    target: 'pino-telegram-webhook',
    options: {
      chatId: -1001234567890,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    },
  },
});
```

Set the level on the logger, as above, or on each entry of `targets` (see
[Logging to Telegram and stdout](#logging-to-telegram-and-stdout)). A `level`
next to a single `target` is ignored by pino, and every log would be sent to
Telegram.

## Options

| Option         | Type               | Default                      | Description                                                                                                                                                                                                                                               |
| -------------- | ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatId`       | `number \| string` |                              | **Required.** Chat ID (a number) or the username of a public channel (`'@channelusername'`).                                                                                                                                                              |
| `botToken`     | `string`           |                              | **Required.** Bot token from [@BotFather](https://t.me/BotFather).                                                                                                                                                                                        |
| `verbose`      | `boolean`          | `false`                      | Send the whole log record as JSON instead of the message only. See [Message format](#message-format).                                                                                                                                                     |
| `messageKey`   | `string`           | `'msg'`                      | Key of the log message. Set it if you changed the logger's [`messageKey`](https://github.com/pinojs/pino/blob/HEAD/docs/api.md#messagekey-string).                                                                                                        |
| `extra`        | `object`           | `{}`                         | Any [sendMessage](https://core.telegram.org/bots/api#sendmessage) parameters, e.g. `parse_mode`, `disable_notification`, `message_thread_id`.                                                                                                             |
| `apiUrl`       | `string`           | `'https://api.telegram.org'` | Bot API URL. Use it for a reverse proxy or a [local Bot API server](https://github.com/tdlib/telegram-bot-api).                                                                                                                                           |
| `timeout`      | `number`           | `10000`                      | Request timeout in milliseconds. `0` disables it.                                                                                                                                                                                                         |
| `retries`      | `number`           | `3`                          | How many times to retry a message after a rate limit (`429`), a server error (`5xx`), a timeout or a network error.                                                                                                                                       |
| `retryDelay`   | `number`           | `1000`                       | Base delay in milliseconds for exponential backoff between retries. `429` responses wait for the `retry_after` returned by Telegram instead.                                                                                                              |
| `maxQueueSize` | `number`           | `1000`                       | Maximum number of messages waiting to be sent. New messages are dropped when it is reached.                                                                                                                                                               |
| `closeTimeout` | `number`           | `8000`                       | How long in milliseconds to keep sending queued messages when the logger closes. pino waits for a transport for at most 10 seconds. `Infinity` waits until the queue is sent, which only makes sense if you close the transport yourself and wait for it. |

The transport throws a `TypeError` on creation if `chatId` or `botToken` is
missing.

## Message format

By default only the message is sent (`msg`, or the key set in `messageKey`).
With `extra.parse_mode` it can contain markup:

```js
const logger = pino({
  level: 'error',
  transport: {
    target: 'pino-telegram-webhook',
    options: {
      chatId: -1001234567890,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      extra: { parse_mode: 'HTML' },
    },
  },
});

logger.error('<b>Payment service is down</b>');
```

Markup in the message is not escaped, so log text with `<` or `&` can make
Telegram reject the message in this mode. Use verbose mode for arbitrary text.

With `verbose: true` the whole log record is sent as JSON:

```json
{
  "level": 50,
  "time": 1721832322878,
  "pid": 13522,
  "hostname": "server",
  "msg": "Payment service is down"
}
```

If `parse_mode` is `HTML`, `Markdown` or `MarkdownV2`, the JSON is sent as a
code block and escaped for that mode, so characters like `<`, `&` or `` ` `` in
the record do not break the markup.

A record without a message (e.g. `logger.error({ userId: 1 })`) is sent as
JSON, the same way as in verbose mode.

## Delivery

- Messages are sent one at a time and in order. Telegram allows about
  [one message per second per chat and 20 messages per minute per group](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this),
  so parallel requests would only be rejected. Send only important logs
  (`error` and above) to Telegram.
- Rate limits, server errors, timeouts and network errors are retried (see
  `retries`). Other errors, such as an invalid token, an unknown chat or
  invalid markup, are not retried.
- When the queue is full (see `maxQueueSize`), new messages are dropped. The
  number of dropped messages is written to stderr.
- Messages longer than Telegram's limit of 4096 characters are truncated and
  end with `…(truncated)`. In verbose mode the JSON is truncated before it is
  wrapped in a code block, so the markup stays valid. With `parse_mode` and
  your own markup in a message, truncation can cut a tag, and Telegram rejects
  such a message.
- Errors that are not retried, or remain after all retries, are written to
  stderr with the `pino-telegram-webhook:` prefix. They are written
  synchronously, so they are not lost when the process exits.
- When the logger is closed, the transport keeps sending the queue for up to
  `closeTimeout`. A retry that would not happen in time, for example after a
  `429` with `retry_after: 40`, is not waited for: the remaining messages are
  reported to stderr as not sent, so the process exits on time and you know
  what was lost.

## Examples

### Logging to Telegram and stdout

Each target has its own level. The logger level must be the lowest of them.

```js
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    targets: [
      { target: 'pino/file', level: 'info', options: { destination: 1 } },
      {
        target: 'pino-telegram-webhook',
        level: 'error',
        options: {
          chatId: -1001234567890,
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          verbose: true,
          extra: { parse_mode: 'HTML' },
        },
      },
    ],
  },
});

logger.info('Server started'); // stdout only
logger.error(new Error('Payment service is down')); // stdout and Telegram
```

The same way you can send different levels to different chats: add a
`pino-telegram-webhook` target for each chat.

### Forum topics

To post to a topic of a forum supergroup, pass its ID as `message_thread_id`:

```js
options: {
  chatId: -1001234567890,
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  extra: { message_thread_id: 42 },
},
```

### Silent messages

`disable_notification` delivers messages without a sound, e.g. for warnings:

```js
extra: { disable_notification: true },
```

### Proxy

The transport uses the built-in `fetch`, which can use an HTTP(S) proxy from
environment variables. Set them when starting the process:

```sh
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://proxy.example.com:8080 node app.js
```

This works in Node.js 24 and later. Recent Node.js 22 releases support it too
with an experimental warning; Node.js 22.12 ignores these variables and
connects directly.

Alternatively, point `apiUrl` to a reverse proxy that forwards requests to
`https://api.telegram.org`:

```js
options: {
  chatId: -1001234567890,
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  apiUrl: 'https://telegram-proxy.example.com',
},
```

SOCKS proxies are not supported by Node.js `fetch`. Run a local HTTP proxy in
front of the SOCKS proxy, or use a reverse proxy with `apiUrl`.

## Sending messages directly

`sendMsgToTg` sends a single message without the transport. It resolves with
the sent [Message](https://core.telegram.org/bots/api#message). On failure it
throws a `TelegramApiError` with `status` (HTTP status), `errorCode` and
`parameters` from the Telegram response.

```js
import { sendMsgToTg, TelegramApiError } from 'pino-telegram-webhook';

try {
  await sendMsgToTg(
    chatId,
    botToken,
    'Hello',
    { parse_mode: 'HTML' }, // sendMessage parameters
    undefined, // apiUrl, defaults to https://api.telegram.org
    { timeout: 5000 }, // or { signal } to abort the request
  );
} catch (error) {
  if (error instanceof TelegramApiError && error.status === 429) {
    console.log(`Retry after ${error.parameters.retry_after} s`);
  }
}
```

## TypeScript

Type definitions are included. `TransportOptions` describes the transport
options:

```ts
import pino from 'pino';
import type { TransportOptions } from 'pino-telegram-webhook';

const options: TransportOptions = {
  chatId: -1001234567890,
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
};

const logger = pino({
  level: 'error',
  transport: { target: 'pino-telegram-webhook', options },
});
```

## FAQ

### How do I get a bot token?

Open [@BotFather](https://t.me/BotFather), send `/newbot` and follow the
instructions. Keep the token secret: anyone who has it controls the bot. Pass
it through an environment variable rather than committing it.

### How do I get the chat ID?

1. Add the bot to the group. For a channel, add it as an administrator that
   can post messages.
2. Send a message in the chat. In a group, send a command to the bot, e.g.
   `/start@your_bot`: by default bots in groups only receive commands and
   replies.
3. Open `https://api.telegram.org/bot<token>/getUpdates` and find
   `"chat": { "id": ... }`.

Group and channel IDs are negative; supergroups and channels start with
`-100`. A public channel can be addressed by its username instead:
`chatId: '@channelusername'`. To send logs to yourself, send `/start` to the
bot in a private chat and use the `id` from `getUpdates`.

`getUpdates` returns nothing if the bot has a webhook set. In that case look up
the chat ID in your webhook handler.

### How do I get the topic ID?

Send a message in the topic and find `message_thread_id` in `getUpdates`, as
above.

### Logs do not arrive. What should I check?

- The level: logs below the logger level (or the target level with `targets`)
  are not sent.
- stderr of your process: errors from Telegram, such as `401: Unauthorized` or
  `400: Bad Request: chat not found`, are written there with the
  `pino-telegram-webhook:` prefix.
- The bot is a member of the group, or an administrator of the channel.

### Why are some logs missing after the process exits?

pino waits for a transport for at most 10 seconds when the process exits, so
the transport stops sending after `closeTimeout` (8 seconds). Under a rate
limit Telegram can ask to wait longer than that. The messages that were not
sent are reported to stderr. Send fewer logs to Telegram, e.g. only `error`
and above.

## License

[MIT](https://github.com/Jhon-Mosk/pino-telegram-webhook/blob/main/LICENSE)
