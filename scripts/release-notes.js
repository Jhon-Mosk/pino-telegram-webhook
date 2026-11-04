// Prints the CHANGELOG.md section of a version as the text of a GitHub
// Release: wrapped lines are joined (GitHub shows line breaks in a release as
// they are) and relative links are made absolute.
//
//   node scripts/release-notes.js 0.5.0
//
// After the tag is pushed and the version is published to npm:
//
//   gh release create v0.5.0 --verify-tag --title 0.5.0 \
//     --notes-file <(node scripts/release-notes.js 0.5.0)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'https://github.com/Jhon-Mosk/pino-telegram-webhook';
const PACKAGE_NAME = 'pino-telegram-webhook';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} changelog contents of CHANGELOG.md
 * @param {string} version e.g. `0.5.0`
 * @param {{ repoUrl?: string, ref?: string, packageName?: string }} [options]
 *   `ref` is the git ref that links to files other than the README point to
 *   (default `v<version>`)
 * @returns {string}
 */
export const releaseNotes = (
  changelog,
  version,
  { repoUrl = REPO_URL, ref = `v${version}`, packageName = PACKAGE_NAME } = {},
) => {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no section for ${version}`);
  }
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end === -1) end = lines.length;

  const section = lines
    .slice(start + 1, end)
    // Link reference definitions such as `[0.5.0]: https://...`.
    .filter((line) => !/^\[[^\]]+\]:\s/.test(line));

  /** @type {string[]} */
  const out = [];
  let inFence = false;
  let joinable = false;
  for (const line of section) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence || /^\s*```/.test(line)) {
      out.push(line);
      joinable = false;
      continue;
    }
    if (line.trim() === '') {
      out.push('');
      joinable = false;
      continue;
    }
    const startsBlock = /^(#{1,6} |[-*+] |\d+\. |>)/.test(line);
    if (joinable && !startsBlock) {
      out[out.length - 1] += ` ${line.trim()}`;
    } else {
      out.push(line);
    }
    joinable = !/^#{1,6} /.test(line);
  }

  const text = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const body = text.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) {
      return match;
    }
    const [path, hash = ''] = target.split(/(?=#)/);
    const url = /^(\.\/)?README\.md$/i.test(path)
      ? repoUrl
      : `${repoUrl}/blob/${ref}/${path.replace(/^\.\//, '')}`;
    return `](${url}${hash})`;
  });

  const footer = [
    `npm: https://www.npmjs.com/package/${packageName}/v/${version}`,
  ];
  const compare = new RegExp(`^\\[${escapeRegExp(version)}\\]:\\s*(\\S+)`);
  const compareUrl = lines.map((line) => compare.exec(line)?.[1]).find(Boolean);
  if (compareUrl) footer.push(`**Full Changelog**: ${compareUrl}`);

  return `${body}\n\n${footer.join('\n\n')}`;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2]?.replace(/^v/, '');
  if (!version) {
    console.error('Usage: node scripts/release-notes.js <version>');
    process.exit(1);
  }
  const changelog = fs.readFileSync(
    new URL('../CHANGELOG.md', import.meta.url),
    'utf8',
  );
  try {
    process.stdout.write(`${releaseNotes(changelog, version)}\n`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
