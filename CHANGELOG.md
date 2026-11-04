# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The minimum Node.js version is 22.12. `require()` of this ES module works
  without a flag only since then; before, CommonJS projects got
  `ERR_REQUIRE_ESM`.

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

[Unreleased]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Jhon-Mosk/pino-telegram-webhook/compare/v0.4.0...v0.5.0
