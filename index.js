"use strict";

const build = require("pino-abstract-transport");

const API_URL = "https://api.telegram.org/bot";

const sendMsgToTg = async (chatId, botToken, text, extra = {}) => {
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
};

/**
 *
 * @param {object} params - параметры для создания транспорта
 * @param {number} params.chatId - идентификатор чата
 * @param {string} params.botToken - токен бота
 * @param {boolean} params.verbose - отправить отладочную информацию
 * @param {object} params.extra - дополнительные параметры для отправки сообщения https://core.telegram.org/bots/api#sendmessage
 * @returns {Promise}
 */
module.exports = function ({ chatId, botToken, verbose = false, extra = {} }) {
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
};
