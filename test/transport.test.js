import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import { Transform } from 'node:stream';
import { beforeEach, describe, it } from 'node:test';
import createTransport, { sendMsgToTg, TelegramApiError } from '../index.js';

const chatId = -1234567890;
const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
const text = 'Test message';

const jsonResponse = (body, init = { status: 200 }) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });

const okResponse = () => jsonResponse({ ok: true, result: { message_id: 1 } });

const mockFetch = (t, impl = async () => okResponse()) =>
  t.mock.method(globalThis, 'fetch', impl);

/** A fetch that never responds and rejects only when its signal aborts. */
const hangingFetch = async (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal.reason));
  });

const errorResponse = (status, description, parameters) =>
  jsonResponse(
    { ok: false, error_code: status, description, parameters },
    { status },
  );

/** A fetch mock that returns the given responses in order, then OK. */
const sequenceFetch = (...steps) => {
  let call = 0;
  return async () => {
    const step = steps[call++];
    if (step === undefined) return okResponse();
    if (step instanceof Error) throw step;
    return step();
  };
};

const requestOf = (fetchMock, index = 0) => {
  const [url, init] = fetchMock.mock.calls[index].arguments;
  return { url, init, body: JSON.parse(init.body) };
};

const record = (fields = {}) => ({
  level: 50,
  time: 1721832322878,
  pid: 13522,
  hostname: 'fedora',
  msg: text,
  ...fields,
});

/**
 * Writes records to a transport, ends it and waits until it is closed,
 * i.e. until all pending requests are settled.
 */
const runTransport = async (options, records) => {
  const transport = await createTransport({ chatId, botToken, ...options });
  const errors = [];
  transport.on('error', (err) => errors.push(err));
  const closed = once(transport, 'close');

  for (const item of records) {
    transport.write(`${JSON.stringify(item)}\n`);
  }
  transport.end();
  await closed;

  return { transport, errors };
};

describe('sendMsgToTg', () => {
  it('sends a POST request with chat_id, text and extra', async (t) => {
    const fetchMock = mockFetch(t);

    const result = await sendMsgToTg(chatId, botToken, text, {
      parse_mode: 'HTML',
    });

    assert.deepEqual(result, { message_id: 1 });
    assert.equal(fetchMock.mock.callCount(), 1);
    const { url, init, body } = requestOf(fetchMock);
    assert.equal(url, `https://api.telegram.org/bot${botToken}/sendMessage`);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(body, { chat_id: chatId, text, parse_mode: 'HTML' });
  });

  it('uses a custom apiUrl', async (t) => {
    const fetchMock = mockFetch(t);

    await sendMsgToTg(chatId, botToken, text, {}, 'https://proxy.example.com');

    assert.equal(
      requestOf(fetchMock).url,
      `https://proxy.example.com/bot${botToken}/sendMessage`,
    );
  });

  it('strips trailing slashes from a custom apiUrl', async (t) => {
    const fetchMock = mockFetch(t);

    await sendMsgToTg(
      chatId,
      botToken,
      text,
      {},
      'https://proxy.example.com//',
    );

    assert.equal(
      requestOf(fetchMock).url,
      `https://proxy.example.com/bot${botToken}/sendMessage`,
    );
  });

  it('includes the Telegram error description for non-2xx responses', async (t) => {
    mockFetch(t, async () =>
      jsonResponse(
        {
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        },
        { status: 400 },
      ),
    );

    await assert.rejects(sendMsgToTg(chatId, botToken, text), {
      message: '400: Bad Request: chat not found',
    });
  });

  it('includes the Telegram error description for ok: false with status 200', async (t) => {
    mockFetch(t, async () =>
      jsonResponse({ ok: false, error_code: 400, description: 'Bad Request' }),
    );

    await assert.rejects(sendMsgToTg(chatId, botToken, text), {
      message: '400: Bad Request',
    });
  });

  it('falls back to the HTTP status when the body is not JSON', async (t) => {
    mockFetch(
      t,
      async () =>
        new Response('<html>Bad Gateway</html>', {
          status: 502,
          statusText: 'Bad Gateway',
        }),
    );

    await assert.rejects(sendMsgToTg(chatId, botToken, text), {
      message: '502: Bad Gateway',
    });
  });

  it('throws a TelegramApiError with the response details', async (t) => {
    mockFetch(t, async () =>
      jsonResponse(
        {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 5',
          parameters: { retry_after: 5 },
        },
        { status: 429 },
      ),
    );

    const error = await sendMsgToTg(chatId, botToken, text).catch((e) => e);

    assert.ok(error instanceof TelegramApiError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'TelegramApiError');
    assert.equal(error.status, 429);
    assert.equal(error.errorCode, 429);
    assert.deepEqual(error.parameters, { retry_after: 5 });
  });

  it('throws a TelegramApiError with only the status for non-JSON bodies', async (t) => {
    mockFetch(t, async () => new Response('oops', { status: 503 }));

    const error = await sendMsgToTg(chatId, botToken, text).catch((e) => e);

    assert.ok(error instanceof TelegramApiError);
    assert.equal(error.status, 503);
    assert.equal(error.errorCode, undefined);
    assert.equal(error.parameters, undefined);
  });

  it('aborts the request after the timeout', async (t) => {
    mockFetch(t, hangingFetch);

    await assert.rejects(
      sendMsgToTg(chatId, botToken, text, {}, undefined, { timeout: 20 }),
      { name: 'TimeoutError' },
    );
  });

  it('sets a timeout signal by default', async (t) => {
    const fetchMock = mockFetch(t);

    await sendMsgToTg(chatId, botToken, text);

    assert.ok(requestOf(fetchMock).init.signal instanceof AbortSignal);
  });

  it('does not set a timeout when timeout is 0', async (t) => {
    const fetchMock = mockFetch(t);

    await sendMsgToTg(chatId, botToken, text, {}, undefined, { timeout: 0 });

    assert.equal(requestOf(fetchMock).init.signal, undefined);
  });

  it('aborts the request when the passed signal aborts', async (t) => {
    mockFetch(t, hangingFetch);
    const controller = new AbortController();
    const reason = new Error('stop');

    const promise = sendMsgToTg(chatId, botToken, text, {}, undefined, {
      signal: controller.signal,
    });
    controller.abort(reason);

    await assert.rejects(promise, reason);
  });

  it('applies the timeout together with a passed signal', async (t) => {
    mockFetch(t, hangingFetch);

    await assert.rejects(
      sendMsgToTg(chatId, botToken, text, {}, undefined, {
        timeout: 20,
        signal: new AbortController().signal,
      }),
      { name: 'TimeoutError' },
    );
  });

  it('propagates network errors', async (t) => {
    mockFetch(t, async () => {
      throw new TypeError('fetch failed');
    });

    await assert.rejects(sendMsgToTg(chatId, botToken, text), {
      name: 'TypeError',
      message: 'fetch failed',
    });
  });
});

describe('transport', () => {
  const PREFIX = 'pino-telegram-webhook: ';
  /** Lines the transport wrote to stderr (fd 2). */
  let stderr;

  beforeEach((t) => {
    stderr = [];
    const { writeSync } = fs;
    t.mock.method(fs, 'writeSync', (fd, data, ...rest) => {
      if (fd !== 2) return writeSync(fd, data, ...rest);
      stderr.push(String(data));
      return Buffer.byteLength(String(data));
    });
  });

  it('builds a transform stream', async (t) => {
    mockFetch(t);
    const transport = await createTransport({ chatId, botToken });
    assert.ok(transport instanceof Transform);
    transport.destroy();
  });

  for (const [name, options, message] of [
    ['chatId is missing', { botToken }, /"chatId" option is required/],
    [
      'chatId is empty',
      { chatId: ' ', botToken },
      /"chatId" option is required/,
    ],
    ['chatId is an object', { chatId: {}, botToken }, /"chatId" option/],
    ['botToken is missing', { chatId }, /"botToken" option is required/],
    ['botToken is empty', { chatId, botToken: '' }, /"botToken" option/],
  ]) {
    it(`throws when ${name}`, () => {
      assert.throws(() => createTransport(options), {
        name: 'TypeError',
        message,
      });
    });
  }

  it('accepts a string chatId', async (t) => {
    const fetchMock = mockFetch(t);

    await runTransport({ chatId: '@my_channel' }, [record()]);

    assert.equal(requestOf(fetchMock).body.chat_id, '@my_channel');
  });

  it('sends the log message', async (t) => {
    const fetchMock = mockFetch(t);

    await runTransport({ extra: { parse_mode: 'HTML' } }, [record()]);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.deepEqual(requestOf(fetchMock).body, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  });

  it('uses a custom messageKey', async (t) => {
    const fetchMock = mockFetch(t);

    await runTransport({ messageKey: 'message' }, [
      record({ msg: undefined, message: 'custom key' }),
    ]);

    assert.equal(requestOf(fetchMock).body.text, 'custom key');
  });

  it('sends the whole record when it has no message', async (t) => {
    const fetchMock = mockFetch(t);
    const item = record({ msg: undefined, userId: 1 });

    await runTransport({}, [item]);

    assert.equal(requestOf(fetchMock).body.text, JSON.stringify(item, null, 2));
  });

  it('sends the whole record as JSON in verbose mode', async (t) => {
    const fetchMock = mockFetch(t);
    const item = record();

    await runTransport({ verbose: true }, [item]);

    assert.equal(requestOf(fetchMock).body.text, JSON.stringify(item, null, 2));
  });

  for (const [parseMode, wrap] of [
    ['HTML', (s) => `<pre><code class="language-json">${s}</code></pre>`],
    ['Markdown', (s) => `\`\`\`json\n${s}\n\`\`\``],
    ['MarkdownV2', (s) => `\`\`\`json\n${s}\n\`\`\``],
  ]) {
    it(`wraps verbose JSON in a code block for parse_mode ${parseMode}`, async (t) => {
      const fetchMock = mockFetch(t);
      const item = record();

      await runTransport({ verbose: true, extra: { parse_mode: parseMode } }, [
        item,
      ]);

      assert.equal(
        requestOf(fetchMock).body.text,
        wrap(JSON.stringify(item, null, 2)),
      );
    });
  }

  describe('escapes verbose JSON for the parse mode', () => {
    // JSON.stringify turns the backslash into two characters, MarkdownV2
    // escaping doubles them again.
    const item = { level: 50, msg: 'a<b> & `c` ``` d\\e' };

    for (const [parseMode, expectedMsg, wrap] of [
      [
        'HTML',
        'a&lt;b&gt; &amp; `c` ``` d\\\\e',
        (s) => `<pre><code class="language-json">${s}</code></pre>`,
      ],
      [
        'MarkdownV2',
        'a<b> & \\`c\\` \\`\\`\\` d\\\\\\\\e',
        (s) => `\`\`\`json\n${s}\n\`\`\``,
      ],
      ['Markdown', "a<b> & `c` ''' d\\\\e", (s) => `\`\`\`json\n${s}\n\`\`\``],
    ]) {
      it(parseMode, async (t) => {
        const fetchMock = mockFetch(t);

        await runTransport(
          { verbose: true, extra: { parse_mode: parseMode } },
          [item],
        );

        assert.equal(
          requestOf(fetchMock).body.text,
          wrap(`{\n  "level": 50,\n  "msg": "${expectedMsg}"\n}`),
        );
      });
    }
  });

  describe('truncates messages to the Telegram limit of 4096 characters', () => {
    const MARK = '…(truncated)';

    it('keeps messages up to the limit unchanged', async (t) => {
      const fetchMock = mockFetch(t);
      const msg = 'a'.repeat(4096);

      await runTransport({}, [record({ msg })]);

      assert.equal(requestOf(fetchMock).body.text, msg);
    });

    it('truncates a long message', async (t) => {
      const fetchMock = mockFetch(t);

      await runTransport({}, [record({ msg: 'a'.repeat(5000) })]);

      const sent = requestOf(fetchMock).body.text;
      assert.equal(sent.length, 4096);
      assert.ok(sent.endsWith(`a${MARK}`));
    });

    it('does not split a surrogate pair', async (t) => {
      const fetchMock = mockFetch(t);
      const msg = `${'a'.repeat(4096 - MARK.length - 1)}${'😀'.repeat(10)}`;

      await runTransport({}, [record({ msg })]);

      const sent = requestOf(fetchMock).body.text;
      assert.ok(sent.isWellFormed(), 'contains a lone surrogate');
      assert.ok(sent.length <= 4096);
      assert.ok(sent.endsWith(`a${MARK}`));
    });

    it('truncates long verbose JSON', async (t) => {
      const fetchMock = mockFetch(t);

      await runTransport({ verbose: true }, [
        record({ msg: 'a'.repeat(5000) }),
      ]);

      const sent = requestOf(fetchMock).body.text;
      assert.equal(sent.length, 4096);
      assert.ok(sent.endsWith(MARK));
    });

    for (const [parseMode, open, close] of [
      ['HTML', '<pre><code class="language-json">', '</code></pre>'],
      ['MarkdownV2', '```json\n', '\n```'],
      ['Markdown', '```json\n', '\n```'],
    ]) {
      it(`keeps the ${parseMode} code block intact`, async (t) => {
        const fetchMock = mockFetch(t);

        await runTransport(
          { verbose: true, extra: { parse_mode: parseMode } },
          [record({ msg: '<&`'.repeat(2000) })],
        );

        const sent = requestOf(fetchMock).body.text;
        assert.ok(sent.startsWith(open));
        assert.ok(sent.endsWith(`${MARK}${close}`));
        // Escaping makes the raw text longer, but after parsing only the
        // unescaped content counts, and it fits the limit with the wrapper.
        const content = sent.slice(open.length, -close.length);
        const unescaped =
          parseMode === 'HTML'
            ? content
                .replaceAll('&lt;', '<')
                .replaceAll('&gt;', '>')
                .replaceAll('&amp;', '&')
            : parseMode === 'MarkdownV2'
              ? content.replace(/\\([`\\])/g, '$1')
              : content;
        assert.ok(unescaped.length + open.length + close.length <= 4096);
      });
    }
  });

  it('keeps working with an unknown parse_mode in verbose mode', async (t) => {
    const fetchMock = mockFetch(t);
    const item = record();

    const { errors } = await runTransport(
      { verbose: true, extra: { parse_mode: 'markdown_v2' } },
      [item, item],
    );

    assert.deepEqual(errors, []);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(requestOf(fetchMock).body.text, JSON.stringify(item, null, 2));
  });

  it('logs failed requests and keeps sending the next ones', async (t) => {
    const fetchMock = mockFetch(t, async () =>
      jsonResponse(
        { ok: false, error_code: 400, description: 'Bad Request' },
        { status: 400 },
      ),
    );

    const { errors } = await runTransport({}, [record(), record()]);

    assert.deepEqual(errors, []);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.deepEqual(stderr, [
      `${PREFIX}failed to send a log message: 400: Bad Request\n`,
      `${PREFIX}failed to send a log message: 400: Bad Request\n`,
    ]);
  });

  it('passes the timeout option to requests', async (t) => {
    mockFetch(t, hangingFetch);

    await runTransport({ timeout: 20, retries: 0 }, [record()]);

    assert.equal(stderr.length, 1);
    assert.match(stderr[0], /failed to send a log message: TimeoutError: /);
  });

  it('sends messages one at a time and in order', async (t) => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = mockFetch(t, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return okResponse();
    });

    await runTransport(
      {},
      [1, 2, 3].map((n) => record({ msg: `msg ${n}` })),
    );

    assert.equal(maxInFlight, 1);
    assert.deepEqual(
      fetchMock.mock.calls.map((_, i) => requestOf(fetchMock, i).body.text),
      ['msg 1', 'msg 2', 'msg 3'],
    );
  });

  it('retries after retry_after on 429 Too Many Requests', async (t) => {
    const fetchMock = mockFetch(
      t,
      sequenceFetch(() =>
        errorResponse(429, 'Too Many Requests: retry after 0.05', {
          retry_after: 0.05,
        }),
      ),
    );

    const started = performance.now();
    await runTransport({ retryDelay: 0 }, [record()]);
    const elapsed = performance.now() - started;

    assert.equal(fetchMock.mock.callCount(), 2);
    assert.ok(elapsed >= 45, `waited only ${elapsed} ms`);
    assert.deepEqual(stderr, []);
  });

  it('retries server errors, timeouts and network errors', async (t) => {
    const timeoutError = new DOMException('timed out', 'TimeoutError');
    const fetchMock = mockFetch(
      t,
      sequenceFetch(
        () => errorResponse(502, 'Bad Gateway'),
        new TypeError('fetch failed'),
        timeoutError,
      ),
    );

    await runTransport({ retryDelay: 1 }, [record()]);

    assert.equal(fetchMock.mock.callCount(), 4);
    assert.deepEqual(stderr, []);
  });

  it('does not retry other client errors', async (t) => {
    const fetchMock = mockFetch(t, async () =>
      errorResponse(400, 'Bad Request: chat not found'),
    );

    await runTransport({ retryDelay: 1 }, [record()]);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(stderr.length, 1);
  });

  it('gives up after the configured number of retries', async (t) => {
    const fetchMock = mockFetch(t, async () =>
      errorResponse(500, 'Internal Server Error'),
    );

    await runTransport({ retries: 2, retryDelay: 1 }, [record()]);

    assert.equal(fetchMock.mock.callCount(), 3);
    assert.deepEqual(stderr, [
      `${PREFIX}failed to send a log message: 500: Internal Server Error\n`,
    ]);
  });

  it('drops messages when the queue is full and reports how many', async (t) => {
    const fetchMock = mockFetch(t, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return okResponse();
    });

    await runTransport(
      { maxQueueSize: 2 },
      [1, 2, 3, 4, 5].map((n) => record({ msg: `msg ${n}` })),
    );

    // The first message is in flight, the next two wait in the queue.
    assert.deepEqual(
      fetchMock.mock.calls.map((_, i) => requestOf(fetchMock, i).body.text),
      ['msg 1', 'msg 2', 'msg 3'],
    );
    assert.equal(stderr.length, 2);
    assert.match(
      stderr[0],
      /^pino-telegram-webhook: queue is full \(maxQueueSize: 2\)/,
    );
    assert.match(
      stderr[1],
      /^pino-telegram-webhook: 2 log message\(s\) dropped/,
    );
  });

  it('reports the cause of network errors', async (t) => {
    mockFetch(t, async () => {
      throw new TypeError('fetch failed', {
        cause: new Error('getaddrinfo ENOTFOUND api.telegram.org'),
      });
    });

    await runTransport({ retries: 0 }, [record()]);

    assert.deepEqual(stderr, [
      `${PREFIX}failed to send a log message: TypeError: fetch failed (getaddrinfo ENOTFOUND api.telegram.org)\n`,
    ]);
  });

  it('falls back to console.error when stderr cannot be written', async (t) => {
    mockFetch(t, async () => errorResponse(400, 'Bad Request'));
    t.mock.method(fs, 'writeSync', () => {
      throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' });
    });
    const consoleError = t.mock.method(console, 'error', () => {});

    await runTransport({}, [record()]);

    assert.deepEqual(consoleError.mock.calls[0].arguments, [
      `${PREFIX}failed to send a log message: 400: Bad Request`,
    ]);
  });

  describe('closing', () => {
    const tooManyRequests = (retryAfter) => async () =>
      errorResponse(429, `Too Many Requests: retry after ${retryAfter}`, {
        retry_after: retryAfter,
      });

    it('gives up a retry that does not fit in closeTimeout', async (t) => {
      const fetchMock = mockFetch(t, tooManyRequests(40));

      const started = performance.now();
      await runTransport({ closeTimeout: 100 }, [record(), record()]);

      assert.ok(performance.now() - started < 1000, 'waited for retry_after');
      assert.equal(fetchMock.mock.callCount(), 1);
      assert.deepEqual(stderr, [
        `${PREFIX}2 log message(s) not sent before the transport closed: a retry in 40 s after "429: Too Many Requests: retry after 40" does not fit in closeTimeout (100 ms)\n`,
      ]);
    });

    it('keeps waiting for a retry that fits in closeTimeout', async (t) => {
      const fetchMock = mockFetch(
        t,
        sequenceFetch(tooManyRequests(0.2), tooManyRequests(0.2)),
      );
      const transport = createTransport({
        chatId,
        botToken,
        closeTimeout: 1000,
      });
      const closed = once(transport, 'close');

      transport.write(`${JSON.stringify(record())}\n`);
      // Start closing while the first retry delay is already running.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const started = performance.now();
      transport.end();
      await closed;

      assert.equal(fetchMock.mock.callCount(), 3);
      assert.ok(performance.now() - started >= 300, 'did not wait');
      assert.deepEqual(stderr, []);
    });

    it('aborts the request in flight when closeTimeout expires', async (t) => {
      mockFetch(t, hangingFetch);

      const started = performance.now();
      await runTransport({ timeout: 0, closeTimeout: 50 }, [
        record(),
        record(),
        record(),
      ]);

      assert.ok(performance.now() - started < 1000, 'did not abort');
      assert.deepEqual(stderr, [
        `${PREFIX}3 log message(s) not sent before the transport closed: closeTimeout (50 ms) expired\n`,
      ]);
    });

    it('waits for the whole queue with closeTimeout: Infinity', async (t) => {
      const fetchMock = mockFetch(t, sequenceFetch(tooManyRequests(0.3)));

      const started = performance.now();
      await runTransport({ closeTimeout: Number.POSITIVE_INFINITY }, [
        record(),
      ]);

      assert.equal(fetchMock.mock.callCount(), 2);
      assert.ok(performance.now() - started >= 250, 'did not wait');
      assert.deepEqual(stderr, []);
    });
  });

  it('waits for pending requests before closing', async (t) => {
    let completed = 0;
    mockFetch(t, async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      completed += 1;
      return okResponse();
    });

    await runTransport({}, [record(), record()]);

    assert.equal(completed, 2);
  });

  it('emits the error passed to destroy', async (t) => {
    mockFetch(t);
    const transport = await createTransport({ chatId, botToken });
    const error = once(transport, 'error');

    transport.destroy(new Error('boom'));

    const [err] = await error;
    assert.equal(err.message, 'boom');
  });
});
