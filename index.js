import build from "pino-abstract-transport";

const API_URL = "https://api.telegram.org/bot";

export async function sendMsgToTg(chatId, botToken, text, extra = {}) {
  const method = "sendMessage";
  const url = `${API_URL}${botToken}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      ...extra,
    }),
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
      const text = verbose ? JSON.stringify(obj) : obj.msg;
      try {
        await sendMsgToTg(chatId, botToken, text, extra);
      } catch (error) {
        console.error(error);
      }
    }
  });
}
