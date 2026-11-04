import createTransport, {
  type SendMessageExtra,
  sendMsgToTg,
  TelegramApiError,
  type TelegramMessage,
  type TransportOptions,
} from 'pino-telegram-webhook';

const extra: SendMessageExtra = { parse_mode: 'HTML', message_thread_id: 1 };
const options: TransportOptions = {
  chatId: '@channel',
  botToken: 'token',
  extra,
  closeTimeout: Number.POSITIVE_INFINITY,
};
createTransport(options).end();

const message: Promise<TelegramMessage> = sendMsgToTg(1, 'token', 'text');
message.catch((error: unknown) => {
  if (error instanceof TelegramApiError) {
    const seconds: number | undefined = error.parameters?.retry_after;
    console.log(error.status, error.errorCode, seconds);
  }
});

// @ts-expect-error botToken is required
createTransport({ chatId: 1 });
