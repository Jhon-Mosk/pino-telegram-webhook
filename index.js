import fs from 'node:fs';
import { format } from 'node:util';
import build from 'pino-abstract-transport';

const API_URL = 'https://api.telegram.org';
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1_000;
const DEFAULT_MAX_QUEUE_SIZE = 1_000;
// pino (thread-stream) waits at most 10 s for a transport to close and then
// terminates the worker, so the queue has to be done before that.
const DEFAULT_CLOSE_TIMEOUT = 8_000;
const LOG_PREFIX = 'pino-telegram-webhook:';

/**
 * An error returned by the Telegram Bot API or by a proxy in front of it.
 */
export class TelegramApiError extends Error {
  /**
   * @param {string} message
   * @param {object} details
   * @param {number} details.status - HTTP status of the response
   * @param {number} [details.errorCode] - `error_code` from the Telegram response
   * @param {object} [details.parameters] - `parameters` from the Telegram
   *   response, e.g. `{ retry_after: 5 }` for 429 Too Many Requests
   */
  constructor(message, { status, errorCode, parameters } = {}) {
    super(message);
    this.name = 'TelegramApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.parameters = parameters;
  }
}

const combineSignals = (...signals) => {
  const defined = signals.filter(Boolean);
  return defined.length > 1 ? AbortSignal.any(defined) : defined[0];
};

/**
 * Sends a message with the sendMessage method of the Telegram Bot API.
 *
 * @param {number|string} chatId
 * @param {string} botToken
 * @param {string} message
 * @param {object} [extra] - additional sendMessage parameters
 * @param {string} [apiUrl] - Telegram Bot API URL
 * @param {object} [options]
 * @param {number} [options.timeout] - request timeout in ms, `0` disables it
 * @param {AbortSignal} [options.signal] - aborts the request
 * @returns {Promise<object>} the sent Message
 * @throws {TelegramApiError} when the API responds with an error
 */
export async function sendMsgToTg(
  chatId,
  botToken,
  message,
  extra = {},
  apiUrl = API_URL,
  { timeout = DEFAULT_TIMEOUT, signal } = {},
) {
  const method = 'sendMessage';
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/bot${botToken}/${method}`;
  const body = JSON.stringify({
    chat_id: chatId,
    text: message,
    ...extra,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    signal: combineSignals(
      timeout > 0 ? AbortSignal.timeout(timeout) : undefined,
      signal,
    ),
  });

  // Telegram returns a JSON body with `description` for errors too,
  // so the body is read regardless of the HTTP status.
  let data;
  try {
    data = await response.json();
  } catch (error) {
    // A non-JSON body (e.g. an HTML page from a proxy) is reported by the
    // status below; a timeout or a network error while reading is rethrown.
    if (!(error instanceof SyntaxError)) throw error;
  }

  if (data?.ok) return data.result;

  const { status, statusText } = response;

  if (data?.description) {
    throw new TelegramApiError(
      `${data.error_code ?? status}: ${data.description}`,
      { status, errorCode: data.error_code, parameters: data.parameters },
    );
  }

  throw new TelegramApiError(`${status}: ${statusText}`, { status });
}

/**
 * Writes a diagnostic line to stderr synchronously.
 *
 * In a worker thread console.error is relayed through the main thread. While
 * pino waits for the transport to close, the main thread is blocked, so such
 * output is lost exactly when logs fail to be delivered at shutdown.
 */
const report = (...args) => {
  const line = `${LOG_PREFIX} ${format(...args)}\n`;
  try {
    fs.writeSync(2, line);
  } catch {
    // e.g. EAGAIN on a non-blocking pipe
    console.error(line.trimEnd());
  }
};

const describeError = (error) => {
  if (error instanceof TelegramApiError) return error.message;
  const cause = error?.cause?.message ?? error?.cause?.code;
  // "fetch failed" alone is useless, the reason (e.g. ENOTFOUND) is the cause.
  return `${error?.name}: ${error?.message}${cause ? ` (${cause})` : ''}`;
};

/** Resolves after `ms`, or earlier when `signal` aborts. */
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Returns how long to wait before retrying a failed request,
 * or `null` if the error is permanent and the request must not be retried.
 */
const getRetryDelay = (error, attempt, retryDelay) => {
  const backoff = retryDelay * 2 ** attempt;

  if (!(error instanceof TelegramApiError)) return backoff; // network, timeout

  if (error.status === 429 || error.errorCode === 429) {
    const retryAfter = error.parameters?.retry_after;
    return Number.isFinite(retryAfter) ? retryAfter * 1000 : backoff;
  }

  if (error.status >= 500) return backoff;

  return null; // other client errors: bad token, chat not found, bad markup
};

/**
 * Sends messages one at a time, in order. Telegram allows about one message
 * per second per chat, so parallel requests only lead to 429 errors.
 * The queue is bounded: when it is full, new messages are dropped rather than
 * growing memory without limit during a burst of logs.
 */
const createDeliveryQueue = ({ send, retries, retryDelay, maxQueueSize }) => {
  const queue = [];
  let dropped = 0;
  let draining = null;

  // Aborted when closing starts: wakes up a pending retry delay, which is
  // then either shortened to fit the close timeout or given up on.
  const closing = new AbortController();
  // Aborted when the close timeout expires: aborts the request in flight.
  const expired = new AbortController();
  let closeTimeout = Number.POSITIVE_INFINITY;
  let closeDeadline = Number.POSITIVE_INFINITY;

  /** Waits before a retry. Returns false if it would end after the close deadline. */
  const waitForRetry = async (delay) => {
    const retryAt = Date.now() + delay;
    await sleep(delay, closing.signal);

    const remaining = retryAt - Date.now();
    if (remaining <= 0) return true;
    if (retryAt > closeDeadline) return false;

    await sleep(remaining);
    return true;
  };

  /**
   * Sends a message with retries. Returns the reason if the message was given
   * up on because the transport is closing, otherwise `undefined`.
   */
  const deliver = async (message) => {
    for (let attempt = 0; ; attempt++) {
      try {
        await send(message, expired.signal);
        return undefined;
      } catch (error) {
        if (expired.signal.aborted) {
          return `closeTimeout (${closeTimeout} ms) expired`;
        }

        const delay =
          attempt < retries ? getRetryDelay(error, attempt, retryDelay) : null;

        if (delay === null) {
          report(`failed to send a log message: ${describeError(error)}`);
          return undefined;
        }

        if (!(await waitForRetry(delay))) {
          return `a retry in ${Math.ceil(delay / 1000)} s after "${describeError(error)}" does not fit in closeTimeout (${closeTimeout} ms)`;
        }
      }
    }
  };

  const drain = async () => {
    while (queue.length > 0) {
      const reason = await deliver(queue.shift());

      if (reason) {
        // The rest of the queue cannot be sent in time either.
        const unsent = queue.length + 1;
        queue.length = 0;
        report(
          `${unsent} log message(s) not sent before the transport closed: ${reason}`,
        );
      }
    }

    if (dropped > 0) {
      report(
        `${dropped} log message(s) dropped because the queue was full (maxQueueSize: ${maxQueueSize})`,
      );
      dropped = 0;
    }
    draining = null;
  };

  return {
    push(message) {
      if (queue.length >= maxQueueSize) {
        if (dropped === 0) {
          report(
            `queue is full (maxQueueSize: ${maxQueueSize}), dropping log messages`,
          );
        }
        dropped += 1;
        return;
      }

      queue.push(message);
      draining ??= drain();
    },

    /**
     * Sends the rest of the queue within `timeout` ms and resolves when it is
     * done. Messages that cannot be sent in time are reported and dropped.
     */
    async close(timeout) {
      let timer;
      if (Number.isFinite(timeout)) {
        closeTimeout = timeout;
        closeDeadline = Date.now() + timeout;
        timer = setTimeout(() => expired.abort(), timeout);
      }
      closing.abort();

      await draining;
      clearTimeout(timer);
    },
  };
};

// Log records contain arbitrary text (messages, stack traces), so it is
// escaped according to the rules for code blocks of each parse mode:
// https://core.telegram.org/bots/api#formatting-options
const escapeHtml = (string) =>
  string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inside pre and code entities '`' and '\' must be escaped with '\'.
const escapeMarkdownV2Code = (string) => string.replace(/[`\\]/g, '\\$&');

// Legacy Markdown has no escaping inside code blocks, so a "```" that would
// close the block early is replaced.
const escapeMarkdownCode = (string) => string.replace(/```/g, "'''");

const verboseSerializer = {
  html: (string) =>
    `<pre><code class="language-json">${escapeHtml(string)}</code></pre>`,
  markdown: (string) => `\`\`\`json\n${escapeMarkdownCode(string)}\n\`\`\``,
  markdownv2: (string) => `\`\`\`json\n${escapeMarkdownV2Code(string)}\n\`\`\``,
};

// Telegram rejects messages longer than 4096 characters (counted in UTF-16
// code units after entities parsing).
const MAX_MESSAGE_LENGTH = 4096;
const TRUNCATION_MARK = '…(truncated)';

const truncate = (string, maxLength) => {
  if (string.length <= maxLength) return string;

  let end = maxLength - TRUNCATION_MARK.length;
  // Do not cut a surrogate pair (e.g. an emoji) in half.
  const lastCode = string.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;

  return string.slice(0, end) + TRUNCATION_MARK;
};

const prepareMessage = ({ pinoData, verbose, parseMode, messageKey }) => {
  const message = pinoData[messageKey];
  const hasMessage =
    message !== undefined && message !== null && message !== '';

  // A record without a message (e.g. `logger.error({ userId: 1 })`) would be
  // rejected by Telegram with "message text is empty", so the whole record is
  // sent instead.
  if (!verbose && hasMessage) {
    return truncate(String(message), MAX_MESSAGE_LENGTH);
  }

  const msg = JSON.stringify(pinoData, null, 2);
  const serializer =
    typeof parseMode === 'string'
      ? verboseSerializer[parseMode.toLowerCase()]
      : undefined;

  if (!serializer) return truncate(msg, MAX_MESSAGE_LENGTH);

  // Truncate before wrapping and escaping so the markup stays valid.
  // Escape sequences and the wrapper markup do not count towards the limit
  // after parsing, but the wrapper length is reserved anyway to stay safe.
  const wrapperLength = serializer('').length;
  return serializer(truncate(msg, MAX_MESSAGE_LENGTH - wrapperLength));
};

/**
 *
 * @param {object} params - parameters for creating a transport
 * @param {number|string} params.chatId - chat ID or `@channelusername`
 * @param {string} params.botToken - bot token
 * @param {boolean} [params.verbose] - send debugging information
 * @param {string} [params.messageKey] - key for message. Default is 'msg'
 * @param {string} [params.apiUrl] - Telegram Bot API URL. Default is 'https://api.telegram.org'
 * @param {object} [params.extra] - additional parameters for sending a message https://core.telegram.org/bots/api#sendmessage
 * @param {number} [params.timeout] - request timeout in ms. Default is 10000, `0` disables it
 * @param {number} [params.retries] - retries for rate limits (429), server
 *   errors (5xx), timeouts and network errors. Default is 3
 * @param {number} [params.retryDelay] - base delay in ms for exponential
 *   backoff between retries. 429 responses wait for `retry_after` instead.
 *   Default is 1000
 * @param {number} [params.maxQueueSize] - maximum number of messages waiting
 *   to be sent; new messages are dropped when it is reached. Default is 1000
 * @param {number} [params.closeTimeout] - how long in ms to keep sending queued
 *   messages when the logger closes. pino waits at most 10 s for a transport.
 *   Default is 8000, `Infinity` waits until the queue is sent
 * @returns {Promise}
 */
export default function ({
  chatId,
  botToken,
  verbose = false,
  messageKey = 'msg',
  apiUrl = API_URL,
  extra = {},
  timeout = DEFAULT_TIMEOUT,
  retries = DEFAULT_RETRIES,
  retryDelay = DEFAULT_RETRY_DELAY,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  closeTimeout = DEFAULT_CLOSE_TIMEOUT,
}) {
  // Without these every log would fail silently, so fail fast instead.
  if (
    !['number', 'string'].includes(typeof chatId) ||
    String(chatId).trim() === ''
  ) {
    throw new TypeError(
      'pino-telegram-webhook: "chatId" option is required (number or string)',
    );
  }
  if (typeof botToken !== 'string' || botToken.trim() === '') {
    throw new TypeError(
      'pino-telegram-webhook: "botToken" option is required (string)',
    );
  }

  const { parse_mode: parseMode } = extra;
  const queue = createDeliveryQueue({
    send: (message, signal) =>
      sendMsgToTg(chatId, botToken, message, extra, apiUrl, {
        timeout,
        signal,
      }),
    retries,
    retryDelay,
    maxQueueSize,
  });

  return build(
    async (source) => {
      for await (const pinoData of source) {
        const message = prepareMessage({
          pinoData,
          verbose,
          parseMode,
          messageKey,
        });

        queue.push(message);
      }
    },
    {
      // pino-abstract-transport calls the destroy callback itself once the
      // returned promise settles, so `cb` must not be called here.
      async close(err) {
        await queue.close(closeTimeout);
        if (err) throw err;
      },
    },
  );
}
