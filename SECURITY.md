# Security policy

## Supported versions

Security fixes are released for the latest version only.

## Reporting a vulnerability

Please do not report vulnerabilities in public issues. Use
[private vulnerability reporting](https://github.com/Jhon-Mosk/pino-telegram-webhook/security/advisories/new)
on GitHub instead.

Describe the problem, how to reproduce it and the affected versions.

## Bot tokens

A bot token gives full control over the bot. Never include it in issues, pull
requests or logs you share: replace it with `<token>`. If a token leaked,
revoke it in [@BotFather](https://t.me/BotFather) with `/revoke` and use the
new one.

The transport puts the token in the request URL
(`https://api.telegram.org/bot<token>/sendMessage`), as the Bot API requires.
If you send requests through your own proxy (`apiUrl`), make sure it does not
log full URLs.
