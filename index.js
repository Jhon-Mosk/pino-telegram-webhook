import build from "pino-abstract-transport";

const API_URL = "https://api.telegram.org/bot";

export async function sendMsgToTg(chatId, botToken, message, extra = {}) {
  const method = "sendMessage";
  const url = `${API_URL}${botToken}/${method}`;
  const body = JSON.stringify({
    chat_id: chatId,
    text: message,
    ...extra,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  if (response.ok) {
    const data = await response.json();
    const { ok, result, error_code, description } = data;

    if (ok) return result;

    throw new Error(`${error_code}: ${description}`);
  }

  const { status, statusText } = response;
  throw new Error(`${status}: ${statusText}`);
}

const verboseSerializer = {
  html: (string) => `<pre><code class="language-json">${string}</code></pre>`,
  markdown: (string) => `\`\`\`json\n${string}\n\`\`\``,
  markdownv2: (string) => `\`\`\`json\n${string}\n\`\`\``,
};

const prepareMessage = (pinoData, verbose, parseMode) => {
  if (verbose) {
    const msg = JSON.stringify(pinoData, null, 2);

    if (parseMode) {
      const parseModeLC = parseMode.toLowerCase();
      const serializer = verboseSerializer[parseModeLC];
      return serializer(msg);
    }

    return msg;
  }

  return pinoData.msg;
};

/**
 *
 * @param {object} params - parameters for creating a transport
 * @param {number} params.chatId - chat ID
 * @param {string} params.botToken - bot token
 * @param {boolean} params.verbose - send debugging information
 * @param {object} params.extra - additional parameters for sending a message https://core.telegram.org/bots/api#sendmessage
 * @returns {Promise}
 */
export default function ({ chatId, botToken, verbose = false, extra = {} }) {
  return build(async function (source) {
    for await (const obj of source) {
      const { parse_mode } = extra;
      const message = prepareMessage(obj, verbose, parse_mode);

      try {
        await sendMsgToTg(chatId, botToken, message, extra);
      } catch (error) {
        console.error(error);
      }
    }
  });
}
