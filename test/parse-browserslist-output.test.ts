import { describe, expect, it } from 'vitest';
import { parse, prBody } from '../src/parse-browserslist-output.js';

// output of update-browserslist-db 1.4, colors included
const withChanges = [
  'Latest version:     1.0.30001821',
  'Installed version:       \u001b[1m\u001b[31m1.0.30001820\u001b[39m\u001b[22m',
  'Removing old caniuse-lite from lock file',
  'Installing new caniuse-lite version',
  '\u001b[33m$ npm install caniuse-lite baseline-browser-mapping\u001b[39m',
  'caniuse-lite has been successfully updated',
  '',
  'Target browser changes:',
  '\u001b[31m- and_chr 141\u001b[39m',
  '\u001b[32m+ and_chr 142\u001b[39m',
  '\u001b[32m+ safari 26.2\u001b[39m',
  '',
].join('\n');

describe('parse', () => {
  it('extracts versions and browser changes', () => {
    expect(parse(withChanges)).toEqual({
      latestVersion: '1.0.30001821',
      installedVersion: '1.0.30001820',
      browsersAdded: ['and_chr 142', 'safari 26.2'],
      browsersRemoved: ['and_chr 141'],
    });
  });

  it('handles several installed versions and no target changes', () => {
    const output = [
      'Installed versions:      \u001b[1m\u001b[31m1.0.30001700, 1.0.30001820\u001b[39m\u001b[22m',
      'caniuse-lite has been successfully updated',
      '',
      '\u001b[32mNo target browser changes\u001b[39m',
    ].join('\n');
    expect(parse(output)).toEqual({
      latestVersion: '',
      installedVersion: '1.0.30001700, 1.0.30001820',
      browsersAdded: [],
      browsersRemoved: [],
    });
  });

  it('handles empty output', () => {
    expect(parse('')).toEqual({ latestVersion: '', installedVersion: '', browsersAdded: [], browsersRemoved: [] });
  });
});

describe('prBody', () => {
  it('renders versions and a diff block', () => {
    expect(prBody(withChanges)).toBe(
      [
        'Caniuse database has been updated. Review changes, merge this PR and have a 🍺.',
        'Installed version: 1.0.30001820',
        'Latest version: 1.0.30001821',
        'Target browsers changes:',
        '',
        '```diff',
        '- and_chr 141',
        '+ and_chr 142',
        '+ safari 26.2',
        '```',
      ].join('\n'),
    );
  });

  it('renders only the message without information', () => {
    expect(prBody('')).toBe('Caniuse database has been updated. Review changes, merge this PR and have a 🍺.');
  });
});
