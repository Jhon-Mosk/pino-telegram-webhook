import type { Transform } from 'node:stream';

/**
 * Additional parameters of the sendMessage method.
 * @see https://core.telegram.org/bots/api#sendmessage
 */
export interface SendMessageExtra {
  /** `HTML`, `Markdown` or `MarkdownV2`. */
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2' | (string & {});
  /** Forum topic to post to. */
  message_thread_id?: number;
  disable_notification?: boolean;
  protect_content?: boolean;
  [key: string]: unknown;
}

export interface TransportOptions {
  /** Chat ID (a number) or the username of a channel (`'@channelusername'`). */
  chatId: number | string;
  /** Bot token. */
  botToken: string;
  /**
   * Send the whole log record as JSON instead of the message only.
   * @default false
   */
  verbose?: boolean;
  /**
   * Key of the log message. Set it if pino's `messageKey` was changed.
   * @default 'msg'
   */
  messageKey?: string;
  /**
   * Telegram Bot API URL, e.g. of your own reverse proxy.
   * @default 'https://api.telegram.org'
   */
  apiUrl?: string;
  /** Additional sendMessage parameters. */
  extra?: SendMessageExtra;
  /**
   * Request timeout in ms, `0` disables it.
   * @default 10000
   */
  timeout?: number;
  /**
   * Retries for rate limits (429), server errors (5xx), timeouts and network
   * errors.
   * @default 3
   */
  retries?: number;
  /**
   * Base delay in ms for exponential backoff between retries. 429 responses
   * wait for `retry_after` instead.
   * @default 1000
   */
  retryDelay?: number;
  /**
   * Maximum number of messages waiting to be sent; new messages are dropped
   * when it is reached.
   * @default 1000
   */
  maxQueueSize?: number;
  /**
   * How long in ms to keep sending queued messages when the logger closes.
   * pino waits at most 10 s for a transport. `Infinity` waits until the queue
   * is sent.
   * @default 8000
   */
  closeTimeout?: number;
}

export interface SendOptions {
  /**
   * Request timeout in ms, `0` disables it.
   * @default 10000
   */
  timeout?: number;
  /** Aborts the request. */
  signal?: AbortSignal;
}

/** `parameters` of a Telegram error response. */
export interface ResponseParameters {
  /** Seconds to wait before repeating the request (429 Too Many Requests). */
  retry_after?: number;
  /** The group has been migrated to a supergroup with this ID. */
  migrate_to_chat_id?: number;
}

/** The Message object returned by sendMessage. */
export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string; [key: string]: unknown };
  text?: string;
  [key: string]: unknown;
}

/** An error returned by the Telegram Bot API or by a proxy in front of it. */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    details?: {
      status?: number;
      errorCode?: number;
      parameters?: ResponseParameters;
    },
  );
  name: 'TelegramApiError';
  /** HTTP status of the response. */
  status: number;
  /** `error_code` from the Telegram response. */
  errorCode?: number;
  /** `parameters` from the Telegram response, e.g. `{ retry_after: 5 }`. */
  parameters?: ResponseParameters;
}

/**
 * Sends a message with the sendMessage method of the Telegram Bot API.
 *
 * @returns the sent message
 * @throws {TelegramApiError} when the API responds with an error
 */
export function sendMsgToTg(
  chatId: number | string,
  botToken: string,
  message: string,
  extra?: SendMessageExtra,
  apiUrl?: string,
  options?: SendOptions,
): Promise<TelegramMessage>;

/**
 * Creates the transport. Usually it is not called directly: pino loads it
 * by name in a worker thread, see `transport.target`.
 *
 * @throws {TypeError} when `chatId` or `botToken` is missing
 */
export default function pinoTelegramWebhook(
  options: TransportOptions,
): Transform;
