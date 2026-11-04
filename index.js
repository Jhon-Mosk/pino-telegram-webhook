import build from 'pino-abstract-transport';

const API_URL = 'https://api.telegram.org';
const DEFAULT_TIMEOUT = 10_000;

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
 * @returns {Promise<object>} the sent Message
 * @throws {TelegramApiError} when the API responds with an error
 */
export async function sendMsgToTg(
  chatId,
  botToken,
  message,
  extra = {},
  apiUrl = API_URL,
  { timeout = DEFAULT_TIMEOUT } = {},
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
    signal: timeout > 0 ? AbortSignal.timeout(timeout) : undefined,
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

const verboseSerializer = {
  html: (string) => `<pre><code class="language-json">${string}</code></pre>`,
  markdown: (string) => `\`\`\`json\n${string}\n\`\`\``,
  markdownv2: (string) => `\`\`\`json\n${string}\n\`\`\``,
};

const prepareMessage = ({ pinoData, verbose, parseMode, messageKey }) => {
  const message = pinoData[messageKey];
  const hasMessage =
    message !== undefined && message !== null && message !== '';

  // A record without a message (e.g. `logger.error({ userId: 1 })`) would be
  // rejected by Telegram with "message text is empty", so the whole record is
  // sent instead.
  if (!verbose && hasMessage) return String(message);

  const msg = JSON.stringify(pinoData, null, 2);

  if (typeof parseMode !== 'string') return msg;

  const serializer = verboseSerializer[parseMode.toLowerCase()];
  return serializer ? serializer(msg) : msg;
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

  const pendingPromises = new Set();
  const { parse_mode: parseMode } = extra;

  return build(
    async (source) => {
      for await (const pinoData of source) {
        const message = prepareMessage({
          pinoData,
          verbose,
          parseMode,
          messageKey,
        });

        const promise = sendMsgToTg(chatId, botToken, message, extra, apiUrl, {
          timeout,
        })
          .catch((reason) => console.error(reason))
          .finally(() => {
            pendingPromises.delete(promise);
          });
        pendingPromises.add(promise);
      }
    },
    {
      // pino-abstract-transport calls the destroy callback itself once the
      // returned promise settles, so `cb` must not be called here.
      async close(err) {
        await Promise.allSettled(pendingPromises);
        if (err) throw err;
      },
    },
  );
}
