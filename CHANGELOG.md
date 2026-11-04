# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The minimum Node.js version is 22.12. `require()` of this ES module works
  without a flag only since then; before, CommonJS projects got
  `ERR_REQUIRE_ESM`.
- When `closeTimeout` expires with a request in flight, the report in stderr
  no longer counts that message as not sent: Telegram may have received it
  before the request was aborted. It is reported as possibly not delivered.

## [0.5.0] - 2026-11-04

### Added

- Options `timeout`, `retries`, `retryDelay`, `maxQueueSize` and `closeTimeout`.
  See [Delivery](README.md#delivery).
- `TelegramApiError` with `status`, `errorCode` and `parameters` (e.g.
  `retry_after`) is exported.
- `sendMsgToTg` accepts `{ timeout, signal }` as the sixth argument.
- TypeScript definitions.

### Changed

- Messages are sent one at a time and in order instead of all at once.
  Rate limits (`429`, waits for `retry_after`), server errors, timeouts and
  network errors are retried. Other errors are not.
- The queue is limited to `maxQueueSize` messages (1000). New messages are
  dropped when it is full, and the number of dropped messages is written to
  stderr.
- Requests time out after 10 seconds by default.
- When the logger closes, the transport keeps sending for up to `closeTimeout`
  (8 seconds) instead of waiting for all requests. Messages that were not sent
  in time are reported to stderr.
- A record without a message (e.g. `logger.error({ userId: 1 })`) is sent as
  JSON. Before, Telegram rejected it because the text was empty.
- Messages longer than 4096 characters are truncated and end with
  `…(truncated)`. Before, Telegram rejected them.
- In verbose mode the JSON is escaped for the chosen `parse_mode`, so `<`, `&`
  or `` ` `` in a record no longer break the markup.
- The transport throws a `TypeError` on creation if `chatId` or `botToken` is
  missing.
- `sendMsgToTg` throws `TelegramApiError` instead of `Error`.
- Errors are written to stderr synchronously with the `pino-telegram-webhook:`
  prefix, so they are not lost when the process exits.
- The package declares `exports`: only `pino-telegram-webhook` itself can be
  imported, deep imports such as `pino-telegram-webhook/index.js` fail.
- `pino-abstract-transport` is updated to 3.0.
- `engines` no longer requires a version of npm.

### Fixed

- Errors returned by Telegram lost the `description`: a `400` was reported as
  `400: ` without the reason.
- An unknown `parse_mode` in verbose mode (e.g. `markdown_v2`) threw inside
  the transport, and no further logs were sent. Now the JSON is sent without
  markup.
- The `close` callback was called twice.

## [0.4.0] - 2026-08-14

### Added

- Option `apiUrl` to send requests through a reverse proxy or your own Bot API
  server. `sendMsgToTg` accepts it as the fifth argument.

### Changed

- The minimum Node.js version is 22 (`engines`: Node.js 22, npm 10).

## [0.3.1] - 2025-11-08

### Fixed

- In verbose mode `parse_mode` was ignored since 0.3.0, and the JSON was sent
  without a code block
  ([#11](https://github.com/Jhon-Mosk/pino-telegram-webhook/pull/11)).

## [0.3.0] - 2025-03-13

### Added

- Option `messageKey` for loggers with a custom
  [`messageKey`](https://github.com/pinojs/pino/blob/HEAD/docs/api.md#messagekey-string).

## [0.2.4] - 2025-01-24

### Changed

- Messages are sent without waiting for the previous one.
- The package contains only `index.js`, `README.md` and `LICENSE`, without
  tests and development configs.

### Fixed

- Messages logged right before the logger closed could be lost. Closing the
  transport now waits for the requests in flight.

## [0.2.3] - 2024-09-06

No changes in the transport code.

## [0.2.2] - 2024-09-02

### Fixed

- Since 0.2.0 the package failed to load with `SyntaxError: Cannot use import
  statement outside a module`: `package.json` lost `"type": "module"`. Node.js
  versions that detect ES module syntax (20.19+, 22.7+) were not affected.

## [0.2.1] - 2024-07-24

### Fixed

- Temporary files that got into the 0.2.0 package are removed. The package
  still could not be loaded, see 0.2.2.

## [0.2.0] - 2024-07-24

### Changed

- In verbose mode the JSON is pretty-printed. With `parse_mode` set to
  `HTML`, `Markdown` or `MarkdownV2` it is sent as a code block.

## [0.1.0] - 2024-06-29

### Added

- `sendMsgToTg` is exported.

### Changed

- The package is an ES module. `require('pino-telegram-webhook')` no longer
  works; loading it as a pino target by name still does.

## [0.0.1] - 2024-06-21

### Added

- `keywords`, `repository`, `bugs` and `homepage` in `package.json`.

## [0.0.0] - 2024-06-21

### Added

- The transport: sends the message of each log record (`msg`) to a Telegram
  chat. Options `chatId`, `botToken`, `verbose` (the whole record as JSON) and
  `extra` (parameters of
  [sendMessage](https://core.telegram.org/bots/api#sendmessage)).

[Unreleased]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/0.3.0...v0.3.1
[0.3.0]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/0.2.4...0.3.0
[0.2.4]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/0.0.0...0.2.4
[0.2.3]: https://www.npmjs.com/package/pino-telegram-webhook/v/0.2.3
[0.2.2]: https://www.npmjs.com/package/pino-telegram-webhook/v/0.2.2
[0.2.1]: https://www.npmjs.com/package/pino-telegram-webhook/v/0.2.1
[0.2.0]: https://www.npmjs.com/package/pino-telegram-webhook/v/0.2.0
[0.1.0]: https://www.npmjs.com/package/pino-telegram-webhook/v/0.1.0
[0.0.1]: https://www.npmjs.com/package/pino-telegram-webhook/v/0.0.1
[0.0.0]: https://github.com/Jhon-Mosk/pino-telegram-webhook/releases/tag/0.0.0
