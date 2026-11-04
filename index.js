import build from 'pino-abstract-transport';

const API_URL = 'https://api.telegram.org';

export async function sendMsgToTg(
  chatId,
  botToken,
  message,
  extra = {},
  apiUrl = API_URL,
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
  });

  // Telegram returns a JSON body with `description` for errors too,
  // so the body is read regardless of the HTTP status.
  let data;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (data?.ok) return data.result;

  if (data?.description) {
    throw new Error(
      `${data.error_code ?? response.status}: ${data.description}`,
    );
  }

  const { status, statusText } = response;
  throw new Error(`${status}: ${statusText}`);
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
 * @param {number} params.chatId - chat ID
 * @param {string} params.botToken - bot token
 * @param {boolean} [params.verbose] - send debugging information
 * @param {string} [params.messageKey] - key for message. Default is 'msg'
 * @param {string} [params.apiUrl] - Telegram Bot API URL. Default is 'https://api.telegram.org'
 * @param {object} [params.extra] - additional parameters for sending a message https://core.telegram.org/bots/api#sendmessage
 * @returns {Promise}
 */
export default function ({
  chatId,
  botToken,
  verbose = false,
  messageKey = 'msg',
  apiUrl = API_URL,
  extra = {},
}) {
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

        const promise = sendMsgToTg(chatId, botToken, message, extra, apiUrl)
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
