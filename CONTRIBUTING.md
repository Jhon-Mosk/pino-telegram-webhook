# Contributing

Thanks for your interest in `pino-telegram-webhook`! Bug reports, ideas and
pull requests are welcome.

## Reporting bugs and requesting features

Open an [issue](https://github.com/Jhon-Mosk/pino-telegram-webhook/issues/new/choose).
For a bug, include the versions of Node.js, pino and `pino-telegram-webhook`,
the transport options and what was written to stderr.

**Never post your bot token.** Replace it with `<token>` in options, logs and
URLs such as `https://api.telegram.org/bot<token>/getUpdates`. If you posted
it by accident, revoke it in [@BotFather](https://t.me/BotFather)
(`/revoke`).

Report security issues privately, see [SECURITY.md](SECURITY.md).

## Development

You need Node.js 22.12 or later.

```sh
git clone https://github.com/Jhon-Mosk/pino-telegram-webhook.git
cd pino-telegram-webhook
npm ci
```

| Command                    | What it does                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                 | Runs the tests ([`node:test`](https://nodejs.org/api/test.html)).                                                                                         |
| `npm run lint`             | Checks formatting and lint rules with [Biome](https://biomejs.dev/).                                                                                      |
| `npm run fix`              | Fixes what Biome can fix.                                                                                                                                 |
| `scripts/check-package.sh` | Packs the package, installs it in a temporary project and checks ESM import, CommonJS `require`, loading as a pino target and the TypeScript definitions. |

Tests must not make requests to Telegram. Mock `fetch` with
`t.mock.method(globalThis, 'fetch')`, as the existing tests in
`test/transport.test.js` do.

If you change how messages are sent, also try the change with your own bot
and a test chat.

## Pull requests

1. Create a branch from `main`: `fix/...`, `feat/...`, `docs/...` or
   `chore/...`.
2. Write commit messages in the
   [Conventional Commits](https://www.conventionalcommits.org/) style:
   `fix: ...`, `feat: ...`, `docs: ...`, `test: ...`, `chore: ...`. Keep one
   change per commit.
3. Add tests for a fix or a feature.
4. Describe user-facing changes in `CHANGELOG.md` under `[Unreleased]`, and
   update `README.md` and `index.d.ts` if options or exports change.
5. Make sure `npm test` and `npm run lint` pass. CI runs them on Node.js
   22.12, 24 and 26 and must be green before a pull request is merged.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
