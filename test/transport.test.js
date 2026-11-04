import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Transform } from 'node:stream';
import { beforeEach, describe, it } from 'node:test';
import createTransport, { sendMsgToTg } from '../index.js';

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
  let consoleError;

  beforeEach((t) => {
    consoleError = t.mock.method(console, 'error', () => {});
  });

  it('builds a transform stream', async (t) => {
    mockFetch(t);
    const transport = await createTransport({ chatId, botToken });
    assert.ok(transport instanceof Transform);
    transport.destroy();
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
    assert.equal(consoleError.mock.callCount(), 2);
    assert.equal(
      consoleError.mock.calls[0].arguments[0].message,
      '400: Bad Request',
    );
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
