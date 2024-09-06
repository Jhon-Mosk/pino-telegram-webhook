import assert from "node:assert/strict";
import { Transform } from "node:stream";
import { after, describe, it } from "node:test";
import { MockAgent, setGlobalDispatcher } from "undici";
import createTransport, { sendMsgToTg } from "../index.js";

const API_URL = "https://api.telegram.org";
const chatId = -1234567890;
const incorrectChatId = -9876543210;
const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
const incorrectBotToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew12";
const text = "Test message";
const incorrectText = "?/:,*~@#$%^&()-+=_<.>|";
const extra = {
  parse_mode: "HTML",
};
const incorrectExtra = {
  parse_mode: "hHtml",
};

const mockAgent = new MockAgent({ connections: 1 });
setGlobalDispatcher(mockAgent);

const mockClient = mockAgent.get(API_URL);

mockClient
  .intercept({
    path: `/bot${botToken}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      ...extra,
    }),
  })
  .reply(200, JSON.stringify({ ok: true, result: text }));

mockClient
  .intercept({
    path: `/bot${botToken}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: incorrectChatId,
      text: text,
      ...extra,
    }),
  })
  .reply(400, "Bad Request");

mockClient
  .intercept({
    path: `/bot${incorrectBotToken}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      ...extra,
    }),
  })
  .reply(401, "Unauthorized");

mockClient
  .intercept({
    path: `/bot${botToken}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: incorrectText,
      ...extra,
    }),
  })
  .reply(400, "Bad Request");

mockClient
  .intercept({
    path: `/bot${botToken}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      ...incorrectExtra,
    }),
  })
  .reply(400, "Bad Request");

describe("pino-telegram-webhook", () => {
  it("build transport", async () => {
    const transport = await createTransport({ chatId, botToken, extra });
    assert.ok(transport instanceof Transform, "Failed to build transport.");
  });

  describe("send message to telegram", () => {
    after(async () => await mockClient.close());

    it("wrong chat ID", () => {
      assert.rejects(
        async () => await sendMsgToTg(incorrectChatId, botToken, text, extra),
        new Error("400: Bad Request")
      );
    });

    it("wrong bot token", () => {
      assert.rejects(
        async () => await sendMsgToTg(chatId, incorrectBotToken, text, extra),
        new Error("401: Unauthorized")
      );
    });

    it("wrong text", () => {
      assert.rejects(
        async () => await sendMsgToTg(chatId, botToken, incorrectText, extra),
        new Error("400: Bad Request")
      );
    });

    it("wrong extra", () => {
      assert.rejects(
        async () => await sendMsgToTg(chatId, botToken, text, incorrectExtra),
        new Error("400: Bad Request")
      );
    });

    it("success sent", async () => {
      await sendMsgToTg(chatId, botToken, text, extra);
    });
  });
});
