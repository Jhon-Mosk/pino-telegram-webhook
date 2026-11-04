import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { releaseNotes } from '../scripts/release-notes.js';

const repoUrl = 'https://github.com/o/r';
const npm = (version) => `npm: https://www.npmjs.com/package/pkg/v/${version}`;
const notes = (changelog, version) =>
  releaseNotes(changelog, version, { repoUrl, packageName: 'pkg' });

const changelog = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-12-01

### Added

- A long item that is
  wrapped over
  three lines.
- See [Delivery](README.md#delivery) and
  [contributing](./CONTRIBUTING.md).
- [Docs](https://example.com/a) and [top](#top) are kept.

A paragraph
over two lines.

\`\`\`js
const a = 1;
  indented();
\`\`\`

## [1.0.0] - 2026-11-01

### Fixed

- Last section.

[Unreleased]: https://github.com/o/r/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/o/r/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/o/r/releases/tag/v1.0.0
`;

describe('releaseNotes', () => {
  it('joins wrapped lines and makes relative links absolute', () => {
    assert.equal(
      notes(changelog, '1.1.0'),
      `### Added

- A long item that is wrapped over three lines.
- See [Delivery](https://github.com/o/r#delivery) and [contributing](https://github.com/o/r/blob/v1.1.0/CONTRIBUTING.md).
- [Docs](https://example.com/a) and [top](#top) are kept.

A paragraph over two lines.

\`\`\`js
const a = 1;
  indented();
\`\`\`

${npm('1.1.0')}

**Full Changelog**: https://github.com/o/r/compare/v1.0.0...v1.1.0`,
    );
  });

  it('stops the last section before the link definitions', () => {
    assert.equal(
      notes(changelog, '1.0.0'),
      `### Fixed

- Last section.

${npm('1.0.0')}

**Full Changelog**: https://github.com/o/r/releases/tag/v1.0.0`,
    );
  });

  it('omits Full Changelog when the version has no link', () => {
    assert.equal(
      notes('## [2.0.0]\n\n- Item.\n', '2.0.0'),
      `- Item.\n\n${npm('2.0.0')}`,
    );
  });

  it('throws when the version has no section', () => {
    assert.throws(() => notes(changelog, '9.9.9'), /no section for 9\.9\.9/);
  });

  it('matches the version exactly', () => {
    const text = '## [1x0x0]\n\n- No.\n\n## [1.0.0-beta.1]\n\n- No.\n';
    assert.throws(() => notes(text, '1.0.0'), /no section for 1\.0\.0/);
  });

  it('formats the real CHANGELOG.md', () => {
    const real = fs.readFileSync(
      new URL('../CHANGELOG.md', import.meta.url),
      'utf8',
    );
    const text = releaseNotes(real, '0.5.0');
    assert.match(
      text,
      /See \[Delivery\]\(https:\/\/github\.com\/Jhon-Mosk\/pino-telegram-webhook#delivery\)/,
    );
    assert.doesNotMatch(text, /\n {2}\S/, 'no wrapped lines are left');
    assert.match(text, /compare\/v0\.4\.0\.\.\.v0\.5\.0$/);
  });
});
